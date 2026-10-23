/**
 * @fileoverview FBI Crime Data Explorer API service.
 * Wraps the CDE base URL under a single init/accessor pattern.
 * All methods accept a Context for correlated logging and respect ctx.signal.
 *
 * Backend status (verified 2026-05-25; agency directory, hate crime, arrest, NIBRS 2026-10-22):
 * - UCR base (api.usa.gov/crime/fbi/ucr): DECOMMISSIONED — Cloud Foundry route removed.
 * - CDE base (api.usa.gov/crime/fbi/cde): PARTIALLY ACTIVE.
 *   Working: /leoka/ytd, /leoka/monthly, /summarized/{scope}/{offense}, /agency/byStateAbbr/{state},
 *            /hate-crime/{scope}/{bias}, /arrest/{scope}/{offense}, /nibrs/{scope}/{offense}
 *   Dead: agency profiles, estimates, participation, human trafficking, arson, code tables
 * @module services/fbi-api/fbi-api-service
 */

import { type Context, z } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { serializationError, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { fetchWithTimeout, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { ServerConfig } from '@/config/server-config.js';
import {
  type CdeScopedWindow,
  FbiAgencyDirectoryResponseSchema,
  type FbiArrestTotals,
  FbiArrestTotalsSchema,
  type FbiDirectoryAgency,
  type FbiHateCrimeTotals,
  FbiHateCrimeTotalsSchema,
  type FbiLeokaChartData,
  FbiLeokaChartSchema,
  type FbiNibrsTotals,
  FbiNibrsTotalsSchema,
  type FbiSummarizedResponse,
  FbiSummarizedResponseSchema,
} from './types.js';

/** The scope path segment CDE expects: `national`, `state/{ABBR}`, or `agency/{ORI}`. */
function scopePath(window: CdeScopedWindow): string {
  if (window.scope === 'state') return `state/${encodeURIComponent(window.stateAbbr)}`;
  if (window.scope === 'agency') return `agency/${encodeURIComponent(window.ori)}`;
  return 'national';
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

export class FbiApiService {
  private readonly cdeBase: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(_appConfig: AppConfig, _storage: StorageService, serverConfig: ServerConfig) {
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

  private get<T>(url: string, ctx: Context): Promise<T> {
    return withRetry(
      async () => {
        ctx.log.debug('FBI CDE API request', { endpoint: new URL(url).pathname });
        const response = await fetchWithTimeout(url, this.timeoutMs, ctx, {
          signal: ctx.signal,
        });
        const text = await response.text();
        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable(
            'FBI API returned HTML instead of JSON — likely rate-limited or endpoint unavailable.',
          );
        }
        return JSON.parse(text) as T;
      },
      {
        operation: 'FbiApiService.get',
        context: ctx,
        baseDelayMs: 1500,
        signal: ctx.signal,
      },
    );
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
    const parsed = FbiAgencyDirectoryResponseSchema.safeParse(await this.get<unknown>(url, ctx));
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
    return unwrapLeoka(await this.get<unknown>(url, ctx), 'ytd');
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
    return unwrapLeoka(await this.get<unknown>(url, ctx), 'monthly');
  }

  private async getSummarized(url: string, ctx: Context): Promise<FbiSummarizedResponse> {
    const parsed = FbiSummarizedResponseSchema.safeParse(await this.get<unknown>(url, ctx));
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
    const parsed = schema.safeParse(await this.get<unknown>(url, ctx));
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
}

// --- Init/accessor pattern ---

let _service: FbiApiService | undefined;

export function initFbiApiService(
  appConfig: AppConfig,
  storage: StorageService,
  serverConfig: ServerConfig,
): void {
  _service = new FbiApiService(appConfig, storage, serverConfig);
}

export function getFbiApiService(): FbiApiService {
  if (!_service) {
    throw new Error('FbiApiService not initialized — call initFbiApiService() in setup()');
  }
  return _service;
}
