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

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { httpErrorFromResponse, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { ServerConfig } from '@/config/server-config.js';
import type { FbiLeokaChartData, FbiSummarizedResponse } from './types.js';

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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
        let response: Response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) {
          throw await httpErrorFromResponse(response, {
            service: 'FBI CDE API',
            data: { url: url.split('?')[0] },
          });
        }
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
        baseDelayMs: 1500,
        signal: ctx.signal,
      },
    );
  }

  // --- LEOKA (Law Enforcement Officers Killed and Assaulted) ---
  // Working CDE endpoints: /leoka/ytd?year={year} and /leoka/monthly?year={year}&month={month}

  async getLeokaYtd(params: { year: number }, ctx: Context): Promise<FbiLeokaChartData> {
    const url = this.buildUrl(this.cdeBase, '/leoka/ytd', { year: params.year });
    ctx.log.debug('getLeokaYtd', { year: params.year });
    const data = await this.get<[{ leoka_chart_ytd: { data: { chart_data: FbiLeokaChartData } } }]>(
      url,
      ctx,
    );
    return data[0].leoka_chart_ytd.data.chart_data;
  }

  async getLeokaMonthly(
    params: { year: number; month: number },
    ctx: Context,
  ): Promise<FbiLeokaChartData> {
    const url = this.buildUrl(this.cdeBase, '/leoka/monthly', {
      year: params.year,
      month: params.month,
    });
    ctx.log.debug('getLeokaMonthly', { year: params.year, month: params.month });
    const data = await this.get<
      [{ leoka_chart_monthly: { data: { chart_data: FbiLeokaChartData } } }]
    >(url, ctx);
    return data[0].leoka_chart_monthly.data.chart_data;
  }

  // --- Summarized offense data ---
  // Working CDE endpoint: /summarized/{national|state/{state}|agency/{ori}}/{offense}?from=MM-YYYY&to=MM-YYYY
  // Valid offenses: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft,
  //                arson, aggravated-assault, rape, homicide

  async getSummarizedNational(
    offense: string,
    params: { from: string; to: string },
    ctx: Context,
  ): Promise<FbiSummarizedResponse> {
    const url = this.buildUrl(this.cdeBase, `/summarized/national/${encodeURIComponent(offense)}`, {
      from: params.from,
      to: params.to,
    });
    ctx.log.debug('getSummarizedNational', { offense, from: params.from, to: params.to });
    return this.get<FbiSummarizedResponse>(url, ctx);
  }

  async getSummarizedState(
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
    return this.get<FbiSummarizedResponse>(url, ctx);
  }

  async getSummarizedAgency(
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
    return this.get<FbiSummarizedResponse>(url, ctx);
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
