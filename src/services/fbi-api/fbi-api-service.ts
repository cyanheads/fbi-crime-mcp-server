/**
 * @fileoverview FBI Crime Data Explorer API service.
 * Wraps the CDE base URL under a single init/accessor pattern.
 * All methods accept a Context for correlated logging and respect ctx.signal.
 *
 * Backend status (verified 2026-05-25; agency directory, hate crime, arrest, NIBRS 2026-10-22;
 * police employees 2026-11-16):
 * - UCR base (api.usa.gov/crime/fbi/ucr): DECOMMISSIONED — Cloud Foundry route removed.
 * - CDE base (api.usa.gov/crime/fbi/cde): PARTIALLY ACTIVE.
 *   Working: /leoka/ytd, /leoka/monthly, /summarized/{scope}/{offense}, /agency/byStateAbbr/{state},
 *            /hate-crime/{scope}/{bias}, /arrest/{scope}/{offense}, /nibrs/{scope}/{offense},
 *            /pe, /pe/{state}, /pe/agency/{ori}
 *   Dead: agency profiles, estimates, participation, human trafficking, arson, code tables
 * @module services/fbi-api/fbi-api-service
 */

import { type Context, z } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { McpError, serializationError, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { fetchWithTimeout, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { ServerConfig } from '@/config/server-config.js';
import {
  type CdeScopedWindow,
  type CdeYearWindow,
  FbiAgencyDirectoryResponseSchema,
  type FbiArrestTotals,
  FbiArrestTotalsSchema,
  type FbiDirectoryAgency,
  type FbiHateCrimeTotals,
  FbiHateCrimeTotalsSchema,
  type FbiLeokaChartData,
  FbiLeokaChartSchema,
  type FbiMonthlyCounts,
  FbiMonthlyCountsSchema,
  type FbiNibrsTotals,
  FbiNibrsTotalsSchema,
  type FbiPoliceEmployees,
  FbiPoliceEmployeesSchema,
  type FbiSummarizedResponse,
  FbiSummarizedResponseSchema,
} from './types.js';

/** The scope path segment CDE expects: `national`, `state/{ABBR}`, or `agency/{ORI}`. */
function scopePath(window: CdeScopedWindow): string {
  if (window.scope === 'state') return `state/${encodeURIComponent(window.stateAbbr)}`;
  if (window.scope === 'agency') return `agency/${encodeURIComponent(window.ori)}`;
  return 'national';
}

/** The `/pe` path for a scope: `/pe`, `/pe/{ABBR}`, or `/pe/agency/{ORI}`. */
function pePath(window: CdeYearWindow): string {
  if (window.scope === 'state') return `/pe/${encodeURIComponent(window.stateAbbr)}`;
  if (window.scope === 'agency') return `/pe/agency/${encodeURIComponent(window.ori)}`;
  return '/pe';
}

const LeokaWrapperSchema = z
  .object({ data: z.object({ chart_data: FbiLeokaChartSchema.nullish() }).nullish() })
  .nullish();
const LeokaEnvelopeSchema = z
  .array(
    z
      .object({ leoka_chart_ytd: LeokaWrapperSchema, leoka_chart_monthly: LeokaWrapperSchema })
      .nullable(),
  )
  .nullable();

/** Accept legitimate absence while rejecting malformed non-null upstream records. */
function unwrapLeoka(value: unknown, period: 'ytd' | 'monthly'): FbiLeokaChartData | null {
  const parsed = LeokaEnvelopeSchema.safeParse(value);
  if (!parsed.success)
    throw serializationError('Malformed FBI LEOKA response: expected chart count records.');
  return parsed.data?.[0]?.[`leoka_chart_${period}`]?.data?.chart_data ?? null;
}

/**
 * One deadline across every attempt and backoff of a CDE request, in milliseconds. MCP SDK clients
 * give up on a tool call after 60 s by default, so a hung upstream must fail before then.
 */
const RETRY_DEADLINE_MS = 50_000;

/**
 * The agent's next step for the refusals the api.data.gov gateway answers itself: every 403 is
 * an API_KEY_* code and 429 is OVER_RATE_LIMIT. fetchWithTimeout keeps the gateway's error body,
 * which names the cause, on the server, so the recovery hint carries it instead.
 */
const GATEWAY_RECOVERY = new Map<number, string>([
  [
    403,
    "api.data.gov refused this server's API key (FBI_API_KEY), so no request succeeds until it changes: stop retrying, and tell the user to set a valid key from https://api.data.gov/signup/ and restart the server.",
  ],
  [
    429,
    "This server's api.data.gov key used up its request limit (DEMO_KEY allows 30 requests an hour and 50 a day per IP address; a registered key allows 1,000 an hour): wait before retrying, and if the server runs on DEMO_KEY, tell the user a free registered key from https://api.data.gov/signup/ raises the limit.",
  ],
]);

/** A fetchWithTimeout 403 or 429 rebuilt with its gateway recovery hint; any other error unchanged. */
function withGatewayRecovery(error: unknown): unknown {
  if (!(error instanceof McpError) || typeof error.data?.status !== 'number') return error;
  const hint = GATEWAY_RECOVERY.get(error.data.status);
  if (!hint) return error;
  return new McpError(
    error.code,
    error.message,
    { ...error.data, recovery: { hint } },
    { cause: error },
  );
}

export class FbiApiService {
  private readonly cdeBase: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  /** Takes the connection settings only; FBI_CLAMP_LIMITS belongs to fbi_search_agencies. */
  constructor(
    _appConfig: AppConfig,
    _storage: StorageService,
    serverConfig: Omit<ServerConfig, 'clampLimits'>,
  ) {
    this.cdeBase = serverConfig.baseUrlCde.replace(/\/$/, '');
    this.apiKey = serverConfig.apiKey;
    this.timeoutMs = serverConfig.requestTimeoutMs;
  }

  // --- Internal helpers ---

  private buildUrl(
    base: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /**
   * GET a CDE URL and parse its JSON body. An HTML page is retried as the upstream being
   * unavailable; any other body that is not JSON is malformed and fails once, unretried.
   * @throws SerializationError when the body is not JSON.
   */
  private async get(url: string, ctx: Context): Promise<unknown> {
    const text = await withRetry(
      async ({ signal, remainingMs }) => {
        ctx.log.debug('FBI CDE API request', { endpoint: new URL(url).pathname });
        const response = await fetchWithTimeout(url, Math.min(this.timeoutMs, remainingMs), ctx, {
          signal,
        }).catch((error: unknown) => {
          throw withGatewayRecovery(error);
        });
        const body = await response.text();
        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(body)) {
          throw serviceUnavailable(
            'FBI API returned HTML instead of JSON — likely rate-limited or endpoint unavailable.',
          );
        }
        return body;
      },
      {
        operation: 'FbiApiService.get',
        context: ctx,
        baseDelayMs: 1500,
        signal: ctx.signal,
        deadlineMs: RETRY_DEADLINE_MS,
      },
    );
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw serializationError('Malformed FBI API response: the body is not JSON.', undefined, {
        cause,
      });
    }
  }

  // --- Agency directory ---
  // Working CDE endpoint: /agency/byStateAbbr/{STATE} — every agency in one state in one
  // response. It ignores county_name and data_year, so callers filter the result.

  /**
   * Fetch one state's agency directory, flattened from its county-keyed groups.
   * Returns null when CDE has no directory for the code (HTTP 200 with `counties: null`).
   * CDE reads lowercase codes as unknown, so pass the code uppercased.
   * @throws SerializationError when the response matches neither documented shape.
   */
  async getAgencyDirectory(stateAbbr: string, ctx: Context): Promise<FbiDirectoryAgency[] | null> {
    const url = this.buildUrl(this.cdeBase, `/agency/byStateAbbr/${encodeURIComponent(stateAbbr)}`);
    ctx.log.debug('getAgencyDirectory', { stateAbbr });
    const parsed = FbiAgencyDirectoryResponseSchema.safeParse(await this.get(url, ctx));
    if (!parsed.success)
      throw serializationError(
        'Malformed FBI agency directory response: expected county-keyed agency records.',
      );
    if ('cde_agencies_query' in parsed.data) return null;
    return Object.values(parsed.data).flat();
  }

  // --- LEOKA (Law Enforcement Officers Killed and Assaulted) ---
  // Working CDE endpoints: /leoka/ytd?year={year} and /leoka/monthly?year={year}&month={month}

  async getLeokaYtd(params: { year: number }, ctx: Context): Promise<FbiLeokaChartData | null> {
    const url = this.buildUrl(this.cdeBase, '/leoka/ytd', { year: params.year });
    ctx.log.debug('getLeokaYtd', { year: params.year });
    return unwrapLeoka(await this.get(url, ctx), 'ytd');
  }

  async getLeokaMonthly(
    params: { year: number; month: number },
    ctx: Context,
  ): Promise<FbiLeokaChartData | null> {
    const url = this.buildUrl(this.cdeBase, '/leoka/monthly', {
      year: params.year,
      month: params.month,
    });
    ctx.log.debug('getLeokaMonthly', { year: params.year, month: params.month });
    return unwrapLeoka(await this.get(url, ctx), 'monthly');
  }

  private async getSummarized(url: string, ctx: Context): Promise<FbiSummarizedResponse> {
    const parsed = FbiSummarizedResponseSchema.safeParse(await this.get(url, ctx));
    if (!parsed.success)
      throw serializationError(
        'Malformed FBI summarized response: expected entity/month count records.',
      );
    return parsed.data;
  }

  // --- Summarized offense data ---
  // Working CDE endpoint: /summarized/{national|state/{state}|agency/{ori}}/{offense}?from=MM-YYYY&to=MM-YYYY
  // Valid offenses: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft,
  //                arson, aggravated-assault, rape, homicide

  getSummarizedNational(
    offense: string,
    params: { from: string; to: string },
    ctx: Context,
  ): Promise<FbiSummarizedResponse> {
    const url = this.buildUrl(this.cdeBase, `/summarized/national/${encodeURIComponent(offense)}`, {
      from: params.from,
      to: params.to,
    });
    ctx.log.debug('getSummarizedNational', { offense, from: params.from, to: params.to });
    return this.getSummarized(url, ctx);
  }

  getSummarizedState(
    stateAbbr: string,
    offense: string,
    params: { from: string; to: string },
    ctx: Context,
  ): Promise<FbiSummarizedResponse> {
    const url = this.buildUrl(
      this.cdeBase,
      `/summarized/state/${encodeURIComponent(stateAbbr)}/${encodeURIComponent(offense)}`,
      { from: params.from, to: params.to },
    );
    ctx.log.debug('getSummarizedState', { stateAbbr, offense, from: params.from, to: params.to });
    return this.getSummarized(url, ctx);
  }

  getSummarizedAgency(
    ori: string,
    offense: string,
    params: { from: string; to: string },
    ctx: Context,
  ): Promise<FbiSummarizedResponse> {
    const url = this.buildUrl(
      this.cdeBase,
      `/summarized/agency/${encodeURIComponent(ori)}/${encodeURIComponent(offense)}`,
      { from: params.from, to: params.to },
    );
    ctx.log.debug('getSummarizedAgency', { ori, offense, from: params.from, to: params.to });
    return this.getSummarized(url, ctx);
  }

  // --- Law Enforcement Employees ---
  // Working CDE endpoints: /pe, /pe/{STATE}, /pe/agency/{ORI} ?from=YYYY&to=YYYY — annual series.
  // Not the shared scope paths: /pe/national and /pe/state/{STATE} answer HTTP 200 with every
  // value null, as do lowercase identifiers. MM-YYYY bounds are refused with HTTP 400.

  /**
   * Fetch the annual law enforcement employee series for one scope and whole-year window.
   * @throws SerializationError when the payload does not match the documented shape.
   */
  async getPoliceEmployees(window: CdeYearWindow, ctx: Context): Promise<FbiPoliceEmployees> {
    const url = this.buildUrl(this.cdeBase, pePath(window), {
      from: window.fromYear,
      to: window.toYear,
    });
    ctx.log.debug('getPoliceEmployees', {
      scope: window.scope,
      from: window.fromYear,
      to: window.toYear,
    });
    const parsed = FbiPoliceEmployeesSchema.safeParse(await this.get(url, ctx));
    if (!parsed.success)
      throw serializationError(
        'Malformed FBI police employee response: expected year-keyed employee, rate, population and coverage series.',
      );
    return parsed.data;
  }

  // --- Category totals ---
  // Working CDE endpoints: /{hate-crime|arrest|nibrs}/{national|state/{state}|agency/{ori}}/{selector}
  //   ?type=totals&from=MM-YYYY&to=MM-YYYY — category counts summed over the window.
  // CDE answers an unknown identifier or selector with HTTP 200 — zeros for hate-crime and arrest,
  // nulls for nibrs — so callers validate both.

  /**
   * Fetch one `type=totals` breakdown and validate it against the endpoint's schema.
   * @throws SerializationError when the payload does not match `schema`.
   */
  private async getTotals<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    window: CdeScopedWindow,
    selector: string,
    ctx: Context,
  ): Promise<T> {
    const url = this.buildUrl(
      this.cdeBase,
      `/${endpoint}/${scopePath(window)}/${encodeURIComponent(selector)}`,
      { type: 'totals', from: window.from, to: window.to },
    );
    ctx.log.debug('getTotals', { endpoint, scope: window.scope, selector, from: window.from });
    const parsed = schema.safeParse(await this.get(url, ctx));
    if (!parsed.success)
      throw serializationError(
        `Malformed FBI ${endpoint} response: expected every category group as a category-to-count map.`,
      );
    return parsed.data;
  }

  /** Hate crime incident and offense category totals; `bias` is `all` or a CDE bias code. */
  getHateCrimeTotals(
    window: CdeScopedWindow,
    bias: string,
    ctx: Context,
  ): Promise<FbiHateCrimeTotals> {
    return this.getTotals('hate-crime', FbiHateCrimeTotalsSchema, window, bias, ctx);
  }

  /** Arrest category totals; `offense` is `all` or a CDE numeric arrest offense code. */
  getArrestTotals(
    window: CdeScopedWindow,
    offense: string,
    ctx: Context,
  ): Promise<FbiArrestTotals> {
    return this.getTotals('arrest', FbiArrestTotalsSchema, window, offense, ctx);
  }

  /** NIBRS victim, offender, and offense category totals for one CDE NIBRS offense code. */
  getNibrsTotals(window: CdeScopedWindow, offense: string, ctx: Context): Promise<FbiNibrsTotals> {
    return this.getTotals('nibrs', FbiNibrsTotalsSchema, window, offense, ctx);
  }

  // --- Monthly counts ---
  // The same three paths with ?type=counts&from=MM-YYYY&to=MM-YYYY: one series per entity and
  // month. hate-crime and arrest send rates and actuals at the top level; nibrs nests them under
  // `offenses`, the /summarized shape.

  /**
   * Fetch the `type=counts` month series for the path and selector of a totals call. `actuals` is
   * null when CDE does not recognize the state or ORI.
   * @throws SerializationError when the payload does not match the endpoint's shape.
   */
  async getCounts(
    endpoint: 'hate-crime' | 'arrest' | 'nibrs',
    window: CdeScopedWindow,
    selector: string,
    ctx: Context,
  ): Promise<FbiMonthlyCounts> {
    const url = this.buildUrl(
      this.cdeBase,
      `/${endpoint}/${scopePath(window)}/${encodeURIComponent(selector)}`,
      { type: 'counts', from: window.from, to: window.to },
    );
    ctx.log.debug('getCounts', { endpoint, scope: window.scope, selector, from: window.from });
    const body = await this.get(url, ctx);
    const malformed = () =>
      serializationError(
        `Malformed FBI ${endpoint} counts response: expected entity-to-month series maps.`,
      );
    if (endpoint !== 'nibrs') {
      const parsed = FbiMonthlyCountsSchema.safeParse(body);
      if (!parsed.success) throw malformed();
      return parsed.data;
    }
    const parsed = FbiSummarizedResponseSchema.safeParse(body);
    if (!parsed.success || !parsed.data.offenses) throw malformed();
    const { offenses, ...rest } = parsed.data;
    return { ...rest, rates: offenses.rates, actuals: offenses.actuals ?? null };
  }
}

// --- Init/accessor pattern ---

let _service: FbiApiService | undefined;

export function initFbiApiService(
  appConfig: AppConfig,
  storage: StorageService,
  serverConfig: Omit<ServerConfig, 'clampLimits'>,
): void {
  _service = new FbiApiService(appConfig, storage, serverConfig);
}

export function getFbiApiService(): FbiApiService {
  if (!_service) {
    throw new Error('FbiApiService not initialized — call initFbiApiService() in setup()');
  }
  return _service;
}
