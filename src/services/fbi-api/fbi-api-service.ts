/**
 * @fileoverview FBI Crime Data Explorer API service.
 * Wraps both UCR and CDE base URLs under a single init/accessor pattern.
 * All methods accept a Context for correlated logging and respect ctx.signal.
 * @module services/fbi-api/fbi-api-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { httpErrorFromResponse, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { ServerConfig } from '@/config/server-config.js';
import type {
  FbiAgency,
  FbiAgencyOffenseRow,
  FbiArrestRow,
  FbiArsonRow,
  FbiCodeTableRow,
  FbiEstimateRow,
  FbiHateCrimeRow,
  FbiHumanTraffickingRow,
  FbiLeokaRow,
  FbiNibrsRow,
  FbiParticipationRow,
} from './types.js';

type PaginatedResult<T> = {
  results: T[];
  pagination?: { count?: number; page?: number; pages?: number };
};

function extractPaginated<T>(
  data: { results?: T[]; pagination?: { count?: number; page?: number; pages?: number } } | T[],
): PaginatedResult<T> {
  if (Array.isArray(data)) return { results: data };
  const result: PaginatedResult<T> = { results: data.results ?? [] };
  if (data.pagination !== undefined) result.pagination = data.pagination;
  return result;
}

function extractResults<T>(data: { results?: T[] } | T[]): T[] {
  return Array.isArray(data) ? data : (data.results ?? []);
}

export class FbiApiService {
  private readonly ucrBase: string;
  private readonly cdeBase: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(_appConfig: AppConfig, _storage: StorageService, serverConfig: ServerConfig) {
    this.ucrBase = serverConfig.baseUrlUcr.replace(/\/$/, '');
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
        // Propagate parent cancellation
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

  // --- Agencies ---

  async searchAgencies(
    params: {
      state_abbr?: string;
      agency_type?: string;
      city?: string;
      population_group?: string;
      page?: number;
      per_page?: number;
    },
    ctx: Context,
  ): Promise<PaginatedResult<FbiAgency>> {
    const url = this.buildUrl(this.ucrBase, '/agencies', {
      state_abbr: params.state_abbr,
      agency_type: params.agency_type,
      city_name: params.city,
      population_group_code: params.population_group,
      page: params.page,
      per_page: params.per_page ?? 25,
    });
    ctx.log.debug('searchAgencies', { url: url.split('?')[0] });
    const data = await this.get<
      | { results?: FbiAgency[]; pagination?: { count?: number; page?: number; pages?: number } }
      | FbiAgency[]
    >(url, ctx);
    return extractPaginated(data);
  }

  getAgency(ori: string, ctx: Context): Promise<FbiAgency> {
    const url = this.buildUrl(this.ucrBase, `/agencies/${encodeURIComponent(ori)}`);
    ctx.log.debug('getAgency', { ori });
    return this.get<FbiAgency>(url, ctx);
  }

  // --- Crime estimates ---

  async getEstimatesNational(
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiEstimateRow[]> {
    const url = this.buildUrl(this.ucrBase, '/estimates/national', {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getEstimatesNational');
    return extractResults(
      await this.get<{ results?: FbiEstimateRow[] } | FbiEstimateRow[]>(url, ctx),
    );
  }

  async getEstimatesState(
    stateAbbr: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiEstimateRow[]> {
    const url = this.buildUrl(this.ucrBase, `/estimates/states/${encodeURIComponent(stateAbbr)}`, {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getEstimatesState', { stateAbbr });
    return extractResults(
      await this.get<{ results?: FbiEstimateRow[] } | FbiEstimateRow[]>(url, ctx),
    );
  }

  // --- Agency offenses ---

  async getAgencyOffensesByOri(
    ori: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiAgencyOffenseRow[]> {
    const url = this.buildUrl(this.ucrBase, `/agencies/count/${encodeURIComponent(ori)}/offenses`, {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getAgencyOffensesByOri', { ori });
    return extractResults(
      await this.get<{ results?: FbiAgencyOffenseRow[] } | FbiAgencyOffenseRow[]>(url, ctx),
    );
  }

  async getAgencyOffensesByState(
    stateAbbr: string,
    params: {
      county_fips?: string;
      since?: number;
      until?: number;
      page?: number;
      per_page?: number;
    },
    ctx: Context,
  ): Promise<PaginatedResult<FbiAgencyOffenseRow>> {
    const path = params.county_fips
      ? `/agencies/count/states/offenses/${encodeURIComponent(stateAbbr)}/counties/${encodeURIComponent(params.county_fips)}`
      : `/agencies/count/states/offenses/${encodeURIComponent(stateAbbr)}`;
    const url = this.buildUrl(this.ucrBase, path, {
      since: params.since,
      until: params.until,
      page: params.page,
      per_page: params.per_page ?? 25,
    });
    ctx.log.debug('getAgencyOffensesByState', { stateAbbr, county_fips: params.county_fips });
    return extractPaginated(
      await this.get<
        | {
            results?: FbiAgencyOffenseRow[];
            pagination?: { count?: number; page?: number; pages?: number };
          }
        | FbiAgencyOffenseRow[]
      >(url, ctx),
    );
  }

  // --- NIBRS breakdown ---

  async getNibrsBreakdown(
    dimension: 'offenders' | 'victims' | 'offenses',
    variable: string,
    scope: 'national' | 'state',
    params: {
      state_abbr?: string;
      offense_name?: string;
      since?: number;
      until?: number;
    },
    ctx: Context,
  ): Promise<FbiNibrsRow[]> {
    let path: string;
    if (scope === 'state' && params.state_abbr) {
      path = `/${dimension}/count/states/${encodeURIComponent(params.state_abbr)}/${encodeURIComponent(variable)}`;
    } else {
      path = `/${dimension}/count/national/${encodeURIComponent(variable)}`;
    }
    if (params.offense_name) {
      path += '/offenses';
    }
    const url = this.buildUrl(this.ucrBase, path, {
      offense: params.offense_name,
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getNibrsBreakdown', { dimension, variable, scope });
    return extractResults(await this.get<{ results?: FbiNibrsRow[] } | FbiNibrsRow[]>(url, ctx));
  }

  // --- Arrests ---

  async getArrestsNational(
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiArrestRow[]> {
    const url = this.buildUrl(this.ucrBase, '/arrests/national', {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getArrestsNational');
    const data = await this.get<{ results?: FbiArrestRow[] } | FbiArrestRow[]>(url, ctx);
    return Array.isArray(data) ? data : ((data as { results?: FbiArrestRow[] }).results ?? []);
  }

  // --- Hate crimes ---

  async getHateCrimesNational(
    variable: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiHateCrimeRow[]> {
    const url = this.buildUrl(this.ucrBase, `/hc/count/national/${encodeURIComponent(variable)}`, {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getHateCrimesNational', { variable });
    return extractResults(
      await this.get<{ results?: FbiHateCrimeRow[] } | FbiHateCrimeRow[]>(url, ctx),
    );
  }

  async getHateCrimesState(
    stateAbbr: string,
    variable: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiHateCrimeRow[]> {
    const url = this.buildUrl(
      this.ucrBase,
      `/hc/count/states/${encodeURIComponent(stateAbbr)}/${encodeURIComponent(variable)}`,
      {
        since: params.since,
        until: params.until,
      },
    );
    ctx.log.debug('getHateCrimesState', { stateAbbr, variable });
    return extractResults(
      await this.get<{ results?: FbiHateCrimeRow[] } | FbiHateCrimeRow[]>(url, ctx),
    );
  }

  // --- Participation (UCR legacy) ---

  async getParticipationNational(ctx: Context): Promise<FbiParticipationRow[]> {
    const url = this.buildUrl(this.ucrBase, '/participation/national');
    ctx.log.debug('getParticipationNational');
    return extractResults(
      await this.get<{ results?: FbiParticipationRow[] } | FbiParticipationRow[]>(url, ctx),
    );
  }

  async getParticipationState(stateAbbr: string, ctx: Context): Promise<FbiParticipationRow[]> {
    const url = this.buildUrl(
      this.ucrBase,
      `/participation/states/${encodeURIComponent(stateAbbr)}`,
    );
    ctx.log.debug('getParticipationState', { stateAbbr });
    return extractResults(
      await this.get<{ results?: FbiParticipationRow[] } | FbiParticipationRow[]>(url, ctx),
    );
  }

  async getParticipationAgencies(
    params: { state_abbr?: string; page?: number; per_page?: number },
    ctx: Context,
  ): Promise<PaginatedResult<FbiParticipationRow>> {
    const url = this.buildUrl(this.ucrBase, '/participation/agencies', {
      state_abbr: params.state_abbr,
      page: params.page,
      per_page: params.per_page ?? 50,
    });
    ctx.log.debug('getParticipationAgencies');
    return extractPaginated(
      await this.get<
        | {
            results?: FbiParticipationRow[];
            pagination?: { count?: number; page?: number; pages?: number };
          }
        | FbiParticipationRow[]
      >(url, ctx),
    );
  }

  // --- CDE participation (newer endpoint) ---

  async getCdeParticipationNational(
    params: { year?: number },
    ctx: Context,
  ): Promise<FbiParticipationRow[]> {
    const url = this.buildUrl(this.cdeBase, '/LATEST/participation/national/', {
      year: params.year,
    });
    ctx.log.debug('getCdeParticipationNational');
    return extractResults(
      await this.get<{ results?: FbiParticipationRow[] } | FbiParticipationRow[]>(url, ctx),
    );
  }

  async getCdeParticipationState(
    stateAbbr: string,
    params: { year?: number },
    ctx: Context,
  ): Promise<FbiParticipationRow[]> {
    const url = this.buildUrl(this.cdeBase, '/LATEST/participation/state/', {
      state_abbr: stateAbbr,
      year: params.year,
    });
    ctx.log.debug('getCdeParticipationState', { stateAbbr });
    return extractResults(
      await this.get<{ results?: FbiParticipationRow[] } | FbiParticipationRow[]>(url, ctx),
    );
  }

  async getCdeParticipationAgencies(
    params: {
      state_abbr?: string;
      year?: number;
      nibrs_only?: boolean;
      page?: number;
      per_page?: number;
    },
    ctx: Context,
  ): Promise<PaginatedResult<FbiParticipationRow>> {
    const url = this.buildUrl(this.cdeBase, '/LATEST/participation/agency/', {
      state_abbr: params.state_abbr,
      year: params.year,
      nibrs: params.nibrs_only ? true : undefined,
      page: params.page,
      per_page: params.per_page ?? 50,
    });
    ctx.log.debug('getCdeParticipationAgencies');
    return extractPaginated(
      await this.get<
        | {
            results?: FbiParticipationRow[];
            pagination?: { count?: number; page?: number; pages?: number };
          }
        | FbiParticipationRow[]
      >(url, ctx),
    );
  }

  // --- Human trafficking ---

  async getHumanTraffickingNational(
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiHumanTraffickingRow[]> {
    const url = this.buildUrl(this.ucrBase, '/ht/national', {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getHumanTraffickingNational');
    return extractResults(
      await this.get<{ results?: FbiHumanTraffickingRow[] } | FbiHumanTraffickingRow[]>(url, ctx),
    );
  }

  async getHumanTraffickingState(
    stateAbbr: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiHumanTraffickingRow[]> {
    const url = this.buildUrl(this.ucrBase, '/ht/states', {
      state_abbr: stateAbbr,
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getHumanTraffickingState', { stateAbbr });
    return extractResults(
      await this.get<{ results?: FbiHumanTraffickingRow[] } | FbiHumanTraffickingRow[]>(url, ctx),
    );
  }

  async getHumanTraffickingByAgency(
    ori: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiHumanTraffickingRow[]> {
    const url = this.buildUrl(this.ucrBase, '/ht/agencies', {
      ori,
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getHumanTraffickingByAgency', { ori });
    return extractResults(
      await this.get<{ results?: FbiHumanTraffickingRow[] } | FbiHumanTraffickingRow[]>(url, ctx),
    );
  }

  // --- LEOKA ---

  async getLeokaMonthly(params: { year?: number }, ctx: Context): Promise<FbiLeokaRow[]> {
    const url = this.buildUrl(this.cdeBase, '/LATEST/leoka/monthly', {
      year: params.year,
    });
    ctx.log.debug('getLeokaMonthly');
    return extractResults(await this.get<{ results?: FbiLeokaRow[] } | FbiLeokaRow[]>(url, ctx));
  }

  async getLeokaYtd(params: { year?: number }, ctx: Context): Promise<FbiLeokaRow[]> {
    const url = this.buildUrl(this.cdeBase, '/LATEST/leoka/ytd', {
      year: params.year,
    });
    ctx.log.debug('getLeokaYtd');
    return extractResults(await this.get<{ results?: FbiLeokaRow[] } | FbiLeokaRow[]>(url, ctx));
  }

  // --- Arson ---

  async getArsonNational(
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiArsonRow[]> {
    const url = this.buildUrl(this.ucrBase, '/arson/national', {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getArsonNational');
    return extractResults(await this.get<{ results?: FbiArsonRow[] } | FbiArsonRow[]>(url, ctx));
  }

  async getArsonState(
    stateAbbr: string,
    params: { since?: number; until?: number },
    ctx: Context,
  ): Promise<FbiArsonRow[]> {
    const url = this.buildUrl(this.ucrBase, `/arson/states/${encodeURIComponent(stateAbbr)}`, {
      since: params.since,
      until: params.until,
    });
    ctx.log.debug('getArsonState', { stateAbbr });
    return extractResults(await this.get<{ results?: FbiArsonRow[] } | FbiArsonRow[]>(url, ctx));
  }

  // --- Code tables ---

  async getCodeTable(tableId: string, ctx: Context): Promise<FbiCodeTableRow[]> {
    const url = this.buildUrl(this.ucrBase, `/codes/${encodeURIComponent(tableId)}`);
    ctx.log.debug('getCodeTable', { tableId });
    return extractResults(
      await this.get<{ results?: FbiCodeTableRow[] } | FbiCodeTableRow[]>(url, ctx),
    );
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
