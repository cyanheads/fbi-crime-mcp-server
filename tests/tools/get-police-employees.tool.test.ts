/**
 * @fileoverview Tests for fbi_get_police_employees through the real CDE service and captured payloads.
 * @module tests/tools/get-police-employees.tool.test
 */

import { readFileSync } from 'node:fs';
import { parseConfig } from '@cyanheads/mcp-ts-core/config';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  createFetchMock,
  createInMemoryStorage,
  runToolContract,
} from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetPoliceEmployees } from '@/mcp-server/tools/definitions/get-police-employees.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const origin = 'https://cde.example.test';
type Result = Awaited<ReturnType<typeof runToolContract>>;
type Series = Record<string, number | null>;

function capture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'));
}

function text(result: Result): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

let http: ReturnType<typeof createFetchMock>;
beforeEach(() => {
  http = createFetchMock();
  http.install();
  initFbiApiService(parseConfig(), createInMemoryStorage(), {
    apiKey: 'TEST_KEY',
    baseUrlCde: origin,
    requestTimeoutMs: 15000,
  });
});
afterEach(() => {
  http.restore();
  vi.useRealTimers();
});

function reply(path: string, payload: unknown): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return url.origin === origin && url.pathname === path;
    },
    respond: Response.json(payload),
  });
}

/** Route every CDE request, so one made despite an early failure lands in `http.calls`. */
function catchAll(payload: unknown = {}): void {
  http.route({
    match: (request) => new URL(request.url).origin === origin,
    respond: Response.json(payload),
  });
}

function requestUrl(): URL {
  const call = http.calls[0];
  if (!call) throw new Error('no fetch was made');
  return new URL(call.request.url);
}

function pinDate(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

/** A `/pe` payload built from per-series year maps; coverage sits under `entity` when given. */
function payload(series: {
  maleOfficers?: Series;
  femaleOfficers?: Series;
  maleCivilians?: Series;
  femaleCivilians?: Series;
  rate?: Series;
  population?: Series;
  coverage?: Series;
  entity?: string;
}): unknown {
  return {
    rates: { 'Law Enforcement Employees per 1,000 People': series.rate ?? {} },
    actuals: {
      'Male Officers': series.maleOfficers ?? {},
      'Male Civilians': series.maleCivilians ?? {},
      'Female Officers': series.femaleOfficers ?? {},
      'Female Civilians': series.femaleCivilians ?? {},
    },
    tooltips: series.entity
      ? { 'Percent of Population Coverage': { [series.entity]: series.coverage ?? {} } }
      : null,
    populations: { 'Participated Population': series.population ?? {} },
  };
}

function expectFailure(result: Result, reason: string, code: number): void {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code, data: { reason } } });
  expect(text(result)).toContain(reason);
}

/** The declared recovery for `reason`, on both surfaces. */
function expectDeclaredRecovery(result: Result, reason: string): void {
  const recovery = fbiGetPoliceEmployees.errors?.find((entry) => entry.reason === reason)?.recovery;
  expect(recovery).toBeDefined();
  expect(result.structuredContent).toMatchObject({
    error: { data: { reason, recovery: { hint: recovery } } },
  });
  expect(text(result)).toContain(recovery);
}

const SEATTLE_ROWS = [
  [2017, 1233, 215, 189, 326, 2.72, 721365],
  [2018, 1202, 218, 187, 347, 2.63, 742759],
  [2019, 1197, 219, 192, 352, 2.57, 763706],
  [2020, 1134, 207, 201, 358, 2.46, 771517],
  [2021, 999, 179, 176, 243, 2.03, 787749],
  [2022, 922, 155, 132, 209, 1.94, 729691],
  [2023, 912, 153, 175, 238, 1.96, 753786],
  [2024, 890, 156, 187, 255, 1.96, 760058],
  [2025, 910, 154, 202, 252, 1.92, 791503],
  [2026, null, null, null, null, null, null],
] as const;

const SEATTLE_TEXT = [
  '## FBI Police Employees — ORI: WASPD0000',
  '**Scope:** agency | **ORI:** WASPD0000',
  '**Years:** 2017 → 2026',
  '**Data last updated:** 11/15/2026',
  "**Max data date:** 11/2026 (CDE's latest UCR data month, not the latest staffing year)",
  '',
  "— means CDE sent no value. Employees per 1,000 is CDE's published rate; CDE supplies population coverage for state and national scope only.",
  '| Year | Male officers | Female officers | Male civilians | Female civilians | Employees per 1,000 | Participated population | Population coverage |',
  '|:-----|---:|---:|---:|---:|---:|---:|---:|',
  '| 2017 | 1,233 | 215 | 189 | 326 | 2.72 | 721,365 | — |',
  '| 2018 | 1,202 | 218 | 187 | 347 | 2.63 | 742,759 | — |',
  '| 2019 | 1,197 | 219 | 192 | 352 | 2.57 | 763,706 | — |',
  '| 2020 | 1,134 | 207 | 201 | 358 | 2.46 | 771,517 | — |',
  '| 2021 | 999 | 179 | 176 | 243 | 2.03 | 787,749 | — |',
  '| 2022 | 922 | 155 | 132 | 209 | 1.94 | 729,691 | — |',
  '| 2023 | 912 | 153 | 175 | 238 | 1.96 | 753,786 | — |',
  '| 2024 | 890 | 156 | 187 | 255 | 1.96 | 760,058 | — |',
  '| 2025 | 910 | 154 | 202 | 252 | 1.92 | 791,503 | — |',
  '| 2026 | — | — | — | — | — | — | — |',
].join('\n');

describe('fbi_get_police_employees scopes', () => {
  it('pins the complete agency result on both surfaces, current year kept as a null row', async () => {
    reply('/pe/agency/WASPD0000', capture('pe-agency-waspd0000-2017-2026'));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'agency',
      ori: 'WASPD0000',
      from_year: 2017,
      to_year: 2026,
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.structuredContent)).toBe(
      JSON.stringify({
        scope: 'agency',
        ori: 'WASPD0000',
        from_year: 2017,
        to_year: 2026,
        years: SEATTLE_ROWS.map(([year, mo, fo, mc, fc, rate, population]) => ({
          year,
          male_officers: mo,
          female_officers: fo,
          male_civilians: mc,
          female_civilians: fc,
          employees_per_1000: rate,
          participated_population: population,
          population_coverage_percent: null,
        })),
        data_last_updated: '11/15/2026',
        max_data_date: '11/2026',
      }),
    );
    expect(text(result)).toBe(SEATTLE_TEXT);
    expect(http.calls).toHaveLength(1);
  });

  it('state scope reads coverage under the entity CDE names, for every published year', async () => {
    reply('/pe/WA', capture('pe-state-wa-2017-2026'));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'state',
      state_abbr: 'WA',
      from_year: 2017,
      to_year: 2026,
    });
    expect(result.isError).not.toBe(true);
    const years = (result.structuredContent as { years: Record<string, number | null>[] }).years;
    expect(years.map((row) => row.year)).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
    const coverage = [100, 99.63, 99.62, 99.61, 99.57, 99.61, 99.55, 99.54, 99.54, null];
    expect(years.map((row) => row.population_coverage_percent)).toEqual(coverage);
    expect(years[7]).toEqual({
      year: 2024,
      male_officers: 9475,
      female_officers: 1299,
      male_civilians: 2328,
      female_civilians: 3233,
      employees_per_1000: 2.05,
      participated_population: 7921326,
      population_coverage_percent: 99.54,
    });
    expect(text(result)).toContain(
      '| 2017 | 9,662 | 1,054 | 1,789 | 2,878 | 2.09 | 7,377,379 | 100% |',
    );
    expect(text(result)).toContain(
      '| 2024 | 9,475 | 1,299 | 2,328 | 3,233 | 2.05 | 7,921,326 | 99.54% |',
    );
    expect(text(result)).toContain('| 2026 | — | — | — | — | — | — | — |');
    expect(result.structuredContent).not.toHaveProperty('ori');
  });

  for (const [scope, field, supplied, normalized, path] of [
    ['state', 'state_abbr', 'wa', 'WA', '/pe/WA'],
    ['agency', 'ori', 'waspd0000', 'WASPD0000', '/pe/agency/WASPD0000'],
  ] as const) {
    it(`requests ${path} and echoes ${normalized} for ${field}=${supplied}`, async () => {
      catchAll(payload({ maleOfficers: { '2024': 1 } }));
      const result = await runToolContract(fbiGetPoliceEmployees, {
        scope,
        [field]: supplied,
        from_year: 2024,
        to_year: 2024,
      });
      expect(result.isError).not.toBe(true);
      expect(requestUrl().pathname).toBe(path);
      expect(result.structuredContent).toHaveProperty(field, normalized);
      expect(text(result)).toContain(normalized);
      expect(text(result)).not.toContain(supplied);
      expect(http.calls).toHaveLength(1);
    });
  }

  it('reads blank identifiers from form clients as unset', async () => {
    catchAll(payload({ maleOfficers: { '2024': 1 } }));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      state_abbr: '',
      ori: '',
      from_year: 2024,
      to_year: 2024,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().pathname).toBe('/pe');
    expect(result.structuredContent).not.toHaveProperty('state_abbr');
    expect(result.structuredContent).not.toHaveProperty('ori');
  });
});

describe('fbi_get_police_employees checks before any request', () => {
  for (const field of ['from_year', 'to_year'] as const) {
    it(`rejects ${field} 1984 in the schema`, async () => {
      catchAll();
      const result = await runToolContract(fbiGetPoliceEmployees, {
        scope: 'national',
        from_year: 1985,
        to_year: 1985,
        [field]: 1984,
      });
      expectFailure(result, 'invalid_arguments', JsonRpcErrorCode.InvalidParams);
      expect(text(result)).toContain(field);
      expect(text(result)).toContain('1985');
      expect(http.calls).toHaveLength(0);
    });
  }

  for (const [field, identifier] of [
    ['state_abbr', 'W1'],
    ['state_abbr', 'WAS'],
    ['ori', 'WASPD000!'],
    ['ori', 'WASPD000'],
  ] as const) {
    it(`rejects malformed ${field}=${identifier} in the schema`, async () => {
      catchAll();
      const result = await runToolContract(fbiGetPoliceEmployees, {
        scope: field === 'ori' ? 'agency' : 'state',
        [field]: identifier,
        from_year: 2024,
        to_year: 2024,
      });
      expectFailure(result, 'invalid_arguments', JsonRpcErrorCode.InvalidParams);
      expect(text(result)).toContain(field);
      expect(http.calls).toHaveLength(0);
    });
  }

  it('accepts the 1985 floor and sends four-digit years', async () => {
    catchAll(payload({ maleOfficers: { '1985': 955 } }));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 1985,
      to_year: 1985,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().searchParams.get('from')).toBe('1985');
    expect(requestUrl().searchParams.get('to')).toBe('1985');
  });

  for (const range of [
    { from_year: 2026, to_year: 2027 },
    { from_year: 2027, to_year: 2027 },
    { from_year: 2027, to_year: 2026 },
  ]) {
    it(`fails year_out_of_range for ${JSON.stringify(range)} in 2026`, async () => {
      pinDate('2026-11-16T12:00:00Z');
      catchAll();
      const result = await runToolContract(fbiGetPoliceEmployees, { scope: 'national', ...range });
      expectFailure(result, 'year_out_of_range', JsonRpcErrorCode.ValidationError);
      expect(result.structuredContent).toMatchObject({
        error: { data: { recovery: { hint: 'Use years from 1985 through 2026.' } } },
      });
      expect(text(result)).toContain('Use years from 1985 through 2026.');
      expect(http.calls).toHaveLength(0);
    });
  }

  it('accepts 2027 once the UTC year turns', async () => {
    pinDate('2027-01-01T00:00:00Z');
    catchAll(payload({ maleOfficers: { '2027': 1 } }));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2027,
      to_year: 2027,
    });
    expect(result.isError).not.toBe(true);
    expect(http.calls).toHaveLength(1);
  });

  it('fails invalid_date_range when from_year is later than to_year', async () => {
    catchAll();
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2024,
      to_year: 2020,
    });
    expectFailure(result, 'invalid_date_range', JsonRpcErrorCode.ValidationError);
    expectDeclaredRecovery(result, 'invalid_date_range');
    expect(text(result)).toContain('from_year 2024 is later than to_year 2020.');
    expect(http.calls).toHaveLength(0);
  });

  it('fails invalid_date_range when from_year is one year after to_year', async () => {
    catchAll();
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2025,
      to_year: 2024,
    });
    expectFailure(result, 'invalid_date_range', JsonRpcErrorCode.ValidationError);
    expect(text(result)).toContain('from_year 2025 is later than to_year 2024.');
    expect(http.calls).toHaveLength(0);
  });

  for (const [input, reason] of [
    [{ scope: 'national', state_abbr: 'WA' }, 'scope_param_incompatible'],
    [{ scope: 'national', ori: 'WASPD0000' }, 'scope_param_incompatible'],
    [{ scope: 'state', state_abbr: 'WA', ori: 'WASPD0000' }, 'scope_param_incompatible'],
    [{ scope: 'agency', ori: 'WASPD0000', state_abbr: 'WA' }, 'scope_param_incompatible'],
    [{ scope: 'state' }, 'scope_param_missing'],
    [{ scope: 'agency' }, 'scope_param_missing'],
  ] as const) {
    it(`fails ${reason} for ${JSON.stringify(input)}`, async () => {
      catchAll();
      const result = await runToolContract(fbiGetPoliceEmployees, {
        from_year: 2023,
        to_year: 2024,
        ...input,
      });
      expectFailure(result, reason, JsonRpcErrorCode.ValidationError);
      expectDeclaredRecovery(result, reason);
      expect(http.calls).toHaveLength(0);
    });
  }
});

describe('fbi_get_police_employees no_data', () => {
  for (const [label, input, path, fixture, where, hint] of [
    [
      'unknown ORI',
      { scope: 'agency', ori: 'ZZQX99999', from_year: 2023, to_year: 2024 },
      '/pe/agency/ZZQX99999',
      'pe-agency-unknown-2023-2024',
      'agency ZZQX99999, 2023–2024',
      'Confirm the ORI with fbi_search_agencies. CDE returns no values both for an ORI it does not recognize and for years with no published employee counts; the current year has none until CDE publishes it.',
    ],
    [
      'unknown state',
      { scope: 'state', state_abbr: 'ZQ', from_year: 2023, to_year: 2024 },
      '/pe/ZQ',
      'pe-state-unknown-2023-2024',
      'state ZQ, 2023–2024',
      'Confirm state_abbr is a US state or territory abbreviation. CDE returns no values both for a code it does not recognize and for years with no published employee counts; the current year has none until CDE publishes it.',
    ],
    [
      'unpublished national year',
      { scope: 'national', from_year: 2026, to_year: 2026 },
      '/pe',
      'pe-national-2026',
      'the nation, 2026–2026',
      'CDE has no published employee counts for these years; the current year has none until CDE publishes it. Request earlier years.',
    ],
  ] as const) {
    it(`fails no_data with its scope's hint for an ${label}`, async () => {
      pinDate('2026-11-16T12:00:00Z');
      reply(path, capture(fixture));
      const result = await runToolContract(fbiGetPoliceEmployees, input);
      expectFailure(result, 'no_data', JsonRpcErrorCode.NotFound);
      expect(result.structuredContent).toMatchObject({
        error: { data: { recovery: { hint } } },
      });
      expect(text(result)).toContain(hint);
      expect(text(result)).toContain(where);
      expect(http.calls).toHaveLength(1);
    });
  }

  it('fails no_data when CDE nulls every section', async () => {
    reply('/pe', {
      rates: null,
      actuals: null,
      tooltips: { 'Percent of Population Coverage': null },
      populations: null,
    });
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2023,
      to_year: 2024,
    });
    expectFailure(result, 'no_data', JsonRpcErrorCode.NotFound);
  });

  const emptyYear = {
    year: 2024,
    male_officers: null,
    female_officers: null,
    male_civilians: null,
    female_civilians: null,
    employees_per_1000: null,
    participated_population: null,
    population_coverage_percent: null,
  };
  for (const [label, series, value, line] of [
    [
      'participated population',
      { population: { '2024': 7921326 } },
      { participated_population: 7921326 },
      '| 2024 | — | — | — | — | — | 7,921,326 | — |',
    ],
    [
      'population coverage',
      { coverage: { '2024': 99.54 }, entity: 'Washington' },
      { population_coverage_percent: 99.54 },
      '| 2024 | — | — | — | — | — | — | 99.54% |',
    ],
    [
      'female civilians',
      { femaleCivilians: { '2024': 3233 } },
      { female_civilians: 3233 },
      '| 2024 | — | — | — | 3,233 | — | — | — |',
    ],
  ] as const) {
    it(`keeps a year whose only value is its ${label}, never no_data`, async () => {
      reply('/pe/WA', payload(series));
      const result = await runToolContract(fbiGetPoliceEmployees, {
        scope: 'state',
        state_abbr: 'WA',
        from_year: 2024,
        to_year: 2024,
      });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { years: unknown[] }).years).toEqual([
        { ...emptyYear, ...value },
      ]);
      expect(text(result)).toContain(line);
    });
  }
});

describe('fbi_get_police_employees upstream failures', () => {
  const input = { scope: 'state', state_abbr: 'WA', from_year: 2023, to_year: 2024 } as const;

  for (const [status, code, requests] of [
    [404, JsonRpcErrorCode.NotFound, 1],
    [403, JsonRpcErrorCode.Forbidden, 1],
    [500, JsonRpcErrorCode.ServiceUnavailable, 4],
  ] as const) {
    it(`fails an HTTP ${status} after ${requests} request${requests > 1 ? 's' : ''}, never no_data`, async () => {
      vi.useFakeTimers();
      http.route({
        match: (request) => new URL(request.url).origin === origin,
        respond: new Response('upstream text', { status }),
      });
      const pending = runToolContract(fbiGetPoliceEmployees, input);
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pending;
      expect(result.structuredContent).toMatchObject({ error: { code, data: { status } } });
      if (status === 500)
        expect(result.structuredContent).toMatchObject({ error: { data: { retryAttempts: 4 } } });
      if (status === 403) {
        const hint = "api.data.gov refused this server's API key (FBI_API_KEY)";
        expect(result.structuredContent).toMatchObject({
          error: { data: { recovery: { hint: expect.stringContaining(hint) } } },
        });
        expect(text(result)).toContain(hint);
      }
      expect(text(result)).not.toContain('no_data');
      expect(http.calls).toHaveLength(requests);
    });
  }

  it('caller cancellation aborts the request and settles as RequestCancelled', async () => {
    const controller = new AbortController();
    const sent = Promise.withResolvers<AbortSignal>();
    http.route({
      match: (request) => new URL(request.url).origin === origin,
      respond: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
          sent.resolve(request.signal);
        }),
    });
    const pending = runToolContract(fbiGetPoliceEmployees, input, {
      context: { signal: controller.signal },
    });
    const signal = await sent.promise;
    controller.abort(new DOMException('Caller cancelled', 'AbortError'));
    expect(signal.aborted).toBe(true);
    const result = await pending;
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.RequestCancelled },
    });
    expect(text(result)).not.toContain('no_data');
    expect(http.calls).toHaveLength(1);
  });
});

describe('fbi_get_police_employees sparse values', () => {
  it('keeps a partly null year and its nulls, in year order', async () => {
    reply(
      '/pe/WA',
      payload({
        maleOfficers: { '2024': 9475, '2023': null },
        femaleOfficers: { '2023': 1183, '2024': 1299 },
        rate: { '2024': 2.05 },
        population: { '2022': 7755215 },
        coverage: { '2023': 99.55 },
        entity: 'Washington',
      }),
    );
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'state',
      state_abbr: 'WA',
      from_year: 2022,
      to_year: 2024,
    });
    expect(result.isError).not.toBe(true);
    expect((result.structuredContent as { years: unknown[] }).years).toEqual([
      {
        year: 2022,
        male_officers: null,
        female_officers: null,
        male_civilians: null,
        female_civilians: null,
        employees_per_1000: null,
        participated_population: 7755215,
        population_coverage_percent: null,
      },
      {
        year: 2023,
        male_officers: null,
        female_officers: 1183,
        male_civilians: null,
        female_civilians: null,
        employees_per_1000: null,
        participated_population: null,
        population_coverage_percent: 99.55,
      },
      {
        year: 2024,
        male_officers: 9475,
        female_officers: 1299,
        male_civilians: null,
        female_civilians: null,
        employees_per_1000: 2.05,
        participated_population: null,
        population_coverage_percent: null,
      },
    ]);
    expect(text(result)).toContain('| 2022 | — | — | — | — | — | 7,755,215 | — |');
    expect(text(result)).toContain('| 2023 | — | 1,183 | — | — | — | — | 99.55% |');
    expect(text(result)).toContain('| 2024 | 9,475 | 1,299 | — | — | 2.05 | — | — |');
  });

  it('keeps zero counts and every published decimal', async () => {
    reply('/pe', payload({ maleOfficers: { '2024': 0 }, rate: { '2024': 1.23456 } }));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2024,
      to_year: 2024,
    });
    expect(result.structuredContent).toMatchObject({
      years: [{ male_officers: 0, employees_per_1000: 1.23456 }],
    });
    expect(text(result)).toContain('| 2024 | 0 | — | — | — | 1.23456 | — | — |');
  });

  it('omits the CDE dates on both surfaces when CDE omits them', async () => {
    reply('/pe', payload({ maleOfficers: { '2024': 1 } }));
    const result = await runToolContract(fbiGetPoliceEmployees, {
      scope: 'national',
      from_year: 2024,
      to_year: 2024,
    });
    expect(result.structuredContent).not.toHaveProperty('data_last_updated');
    expect(result.structuredContent).not.toHaveProperty('max_data_date');
    expect(text(result)).not.toContain('Data last updated');
    expect(text(result)).not.toContain('Max data date');
  });
});
