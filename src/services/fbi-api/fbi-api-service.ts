/**
 * @fileoverview FBI Crime Data Explorer API service.
 * Wraps the CDE base URL under a single init/accessor pattern.
 * All methods accept a Context for correlated logging and respect ctx.signal.
 *
 * Backend status (verified 2026-05-25):
 * - UCR base (api.usa.gov/crime/fbi/ucr): DECOMMISSIONED — Cloud Foundry route removed.
 * - CDE base (api.usa.gov/crime/fbi/cde): PARTIALLY ACTIVE.
 *   Working: /leoka/ytd, /leoka/monthly, /summarized/{scope}/{offense}
 *   Dead: agencies, estimates, participation, nibrs, arrests, hate crimes, human trafficking, arson, code tables
 * @module services/fbi-api/fbi-api-service
 */

import { type Context, z } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { serializationError, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { fetchWithTimeout, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { ServerConfig } from '@/config/server-config.js';
import {
  type FbiLeokaChartData,
  FbiLeokaChartSchema,
  type FbiSummarizedResponse,
  FbiSummarizedResponseSchema,
} from './types.js';

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
        // Log the URL without its api_key query param.
        ctx.log.debug('FBI CDE API request', { url: url.split('?')[0] });
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
