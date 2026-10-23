/**
 * @fileoverview Captured CDE responses through the real service and tool contracts.
 * @module tests/services/cde-contract.test
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
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';
import { fbiGetLeoka } from '@/mcp-server/tools/definitions/get-leoka.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const baseUrl = 'https://cde.example.test';
const summarizedInput = {
  scope: 'agency' as const,
  ori: 'CA0010400',
  offense: 'robbery' as const,
  from_year: 2022,
  from_month: 1,
  to_year: 2022,
  to_month: 1,
};

function capture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'));
}

function text(result: Awaited<ReturnType<typeof runToolContract>>): string {
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
    baseUrlUcr: baseUrl,
    baseUrlCde: baseUrl,
    requestTimeoutMs: 15000,
  });
});
afterEach(() => {
  http.restore();
  vi.useRealTimers();
});

function reply(path: string, payload: unknown): void {
  http.route({
    match: (request) => new URL(request.url).pathname === path,
    respond: Response.json(payload),
  });
}

/**
 * Route every CDE request, so a request a zero-fetch check forbids is recorded in `http.calls`
 * (createFetchMock rejects unmatched requests without recording them).
 */
function catchAllRequests(): void {
  http.route({
    match: (request) => new URL(request.url).origin === baseUrl,
    respond: Response.json({}),
  });
}

/** Default summarized output for the captured state and agency fixtures, pinned byte for byte. */
const PINNED = {
  state: {
    structured: {
      scope: 'state',
      offense: 'robbery',
      entity_name: 'California',
      state_abbr: 'CA',
      from: '01-2022',
      to: '01-2022',
      months: [
        {
          year: 2022,
          month: 1,
          rate_per_100k: 10.89,
          clearance_rate_per_100k: 2.7,
          actual_count: 4208,
          clearance_count: 1042,
          population: 39029342,
          participated_population: 38642850,
          population_coverage_percent: 99.01,
        },
      ],
      total_months: 1,
      data_last_updated: '09/15/2026',
      max_data_date: '09/2026',
    },
    text: '## FBI Crime Data — robbery (CA)\n**Scope:** state | **State:** CA\n**Offense:** robbery | **Range:** 01-2022 → 01-2022\n**Entity:** California\n**Months returned:** 1\n**Data last updated:** 09/15/2026\n**Max data date:** 09/2026\n\nReporting coverage may be incomplete or unavailable. — means unavailable; coverage is supplied by CDE, not calculated from populations.\n| Year | Month | Rate/100k | Clearance Rate | Actual Count | Clearances | Population | Participating population | Population coverage |\n|:-----|:-----:|----------:|---------------:|-------------:|-----------:|-----------:|-------------------------:|--------------------:|\n| 2022 | 01 | 10.89 | 2.7 | 4,208 | 1,042 | 39,029,342 | 38,642,850 | 99.01% |',
  },
  agency: {
    structured: {
      scope: 'agency',
      offense: 'robbery',
      entity_name: 'Emeryville Police Department',
      ori: 'CA0010400',
      from: '01-2022',
      to: '01-2022',
      months: [
        {
          year: 2022,
          month: 1,
          rate_per_100k: 70.42,
          clearance_rate_per_100k: 15.65,
          actual_count: 9,
          clearance_count: 2,
          population: 12781,
          participated_population: 12781,
          population_coverage_percent: null,
        },
      ],
      total_months: 1,
      data_last_updated: '09/15/2026',
      max_data_date: '09/2026',
    },
    text: '## FBI Crime Data — robbery (ORI: CA0010400)\n**Scope:** agency | **ORI:** CA0010400\n**Offense:** robbery | **Range:** 01-2022 → 01-2022\n**Entity:** Emeryville Police Department\n**Months returned:** 1\n**Data last updated:** 09/15/2026\n**Max data date:** 09/2026\n\nReporting coverage may be incomplete or unavailable. — means unavailable; coverage is supplied by CDE, not calculated from populations.\n| Year | Month | Rate/100k | Clearance Rate | Actual Count | Clearances | Population | Participating population | Population coverage |\n|:-----|:-----:|----------:|---------------:|-------------:|-----------:|-----------:|-------------------------:|--------------------:|\n| 2022 | 01 | 70.42 | 15.65 | 9 | 2 | 12,781 | 12,781 | — |',
  },
};

describe('CDE characterization', () => {
  it('national rows retain nullable counts, zero, rate-only months and chronological order', async () => {
    reply('/summarized/national/robbery', {
      offenses: {
        actuals: { 'United States Offenses': { '02-2022': null, '01-2022': 0 } },
        rates: { 'United States Offenses': { '03-2022': 2, '01-2022': 0 } },
      },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'national',
      offense: 'robbery',
      from_year: 2022,
      to_year: 2022,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).not.toHaveProperty('state_abbr');
    expect(result.structuredContent).not.toHaveProperty('ori');
    expect(result.structuredContent).toMatchObject({
      months: [
        { month: 1, actual_count: 0, rate_per_100k: 0 },
        { month: 2, actual_count: null, rate_per_100k: null },
        { month: 3, actual_count: null, rate_per_100k: 2 },
      ],
    });
    expect(text(result)).toContain('| 2022 | 01 | 0 | — | 0 | — |');
    expect(http.calls).toHaveLength(1);
  });
  for (const tool of [fbiGetCrimeEstimates]) {
    it(`${tool.name} preserves captured agency rates and counts`, async () => {
      reply('/summarized/agency/CA0010400/robbery', capture('agency'));
      const result = await runToolContract(tool, summarizedInput);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).not.toHaveProperty('state_abbr');
      expect(result.structuredContent).toMatchObject({
        months: [
          {
            year: 2022,
            month: 1,
            rate_per_100k: 70.42,
            clearance_rate_per_100k: 15.65,
            actual_count: 9,
            clearance_count: 2,
          },
        ],
      });
      expect(text(result)).toContain('| 2022 | 01 | 70.42 | 15.65 | 9 | 2 |');
      expect(http.calls).toHaveLength(1);
    });
    it(`${tool.name} preserves captured state rates and counts`, async () => {
      reply('/summarized/state/CA/robbery', capture('state'));
      const result = await runToolContract(tool, {
        ...summarizedInput,
        scope: 'state',
        ori: undefined,
        state_abbr: 'CA',
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).not.toHaveProperty('ori');
      expect(result.structuredContent).toMatchObject({
        months: [
          {
            rate_per_100k: 10.89,
            clearance_rate_per_100k: 2.7,
            actual_count: 4208,
            clearance_count: 1042,
          },
        ],
      });
      expect(text(result)).toContain('| 2022 | 01 | 10.89 | 2.7 | 4,208 | 1,042 |');
    });
  }
  for (const [scope, path, fixture] of [
    ['state', '/summarized/state/CA/robbery', 'state'],
    ['agency', '/summarized/agency/CA0010400/robbery', 'agency'],
  ] as const) {
    it(`pins the complete default ${scope} output on both surfaces`, async () => {
      reply(path, capture(fixture));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope,
        ...(scope === 'state' && { ori: undefined, state_abbr: 'CA' }),
      });
      expect(JSON.stringify(result.structuredContent)).toBe(
        JSON.stringify(PINNED[scope].structured),
      );
      expect(text(result)).toBe(PINNED[scope].text);
    });
  }
  for (const period of ['ytd', 'monthly'] as const) {
    it(`preserves existing ${period} LEOKA sections`, async () => {
      reply(`/leoka/${period}`, capture(period === 'ytd' ? 'ytd-2023' : 'monthly-2023-6'));
      const result = await runToolContract(fbiGetLeoka, {
        period,
        year: 2023,
        ...(period === 'monthly' && { month: 6 }),
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        period,
        year: 2023,
        weapons: { Rifles: period === 'ytd' ? 10 : 2 },
        officer_activity: { Patrolling: period === 'ytd' ? 11 : 0 },
        lighting_conditions: { Daylight: period === 'ytd' ? 5 : 0 },
      });
      expect(text(result)).toContain(
        period === 'ytd' ? '| South | 20 | 22 |' : '| South | 4 | 2 |',
      );
      expect(text(result)).not.toMatch(/\[object Object\]|NaN/);
      if (period === 'ytd') {
        expect(result.structuredContent).toMatchObject({
          deaths_by_year: { Felonious: { '2023': 60 }, Accidental: { '2023': 34 } },
        });
        expect(text(result)).toContain('| 2023 | 60 | 34 |');
      } else expect(result.structuredContent).not.toHaveProperty('deaths_by_year');
      expect(http.calls).toHaveLength(1);
    });
  }
});

const flatFields = [
  'body_armor_worn',
  'location_of_attack',
  'offender_previously_known_to_agency',
  'offender_prior_mental_illness',
  'offender_prior_relationship',
  'officer_circumstances_time_of_attack',
  'officer_incident_type',
  'officer_type_of_assignment',
  'weather_conditions',
] as const;
const nestedFields = [
  'offender_demographic',
  'officer_demographic',
  'officer_death_by_time_of_day',
] as const;
const newFields = [...flatFields, ...nestedFields, 'officer_death_by_month'] as const;

function envelope(period: 'ytd' | 'monthly', chart: unknown): unknown {
  return [{ [`leoka_chart_${period}`]: { data: { chart_data: chart } } }];
}

function expectFailure(
  result: Awaited<ReturnType<typeof runToolContract>>,
  tool: typeof fbiGetLeoka | typeof fbiGetCrimeEstimates,
  reason: string,
): void {
  const contract = tool.errors?.find((entry) => entry.reason === reason);
  expect(contract).toBeDefined();
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    error: { code: contract?.code, data: { reason, recovery: { hint: contract?.recovery } } },
  });
  expect(text(result)).toContain(reason);
  expect(text(result)).toContain(contract?.recovery);
}

describe('absent and malformed upstream data (#11)', () => {
  for (const period of ['ytd', 'monthly'] as const) {
    const input = { period, year: 2024, ...(period === 'monthly' && { month: 1 }) };
    for (const [label, payload] of Object.entries({
      nullEnvelope: null,
      emptyEnvelope: [],
      nullEntry: [null],
      emptyEntry: [{}],
      nullWrapper: [{ [`leoka_chart_${period}`]: null }],
      nullData: [{ [`leoka_chart_${period}`]: { data: null } }],
      emptyData: [{ [`leoka_chart_${period}`]: { data: {} } }],
      nullChart: envelope(period, null),
      emptyChart: envelope(period, {}),
      nullTotals: envelope(period, { incidents_victim_officer_totals_ytd: null }),
    })) {
      it(`${period} ${label} returns no_data on both surfaces`, async () => {
        reply(`/leoka/${period}`, payload);
        expectFailure(await runToolContract(fbiGetLeoka, input), fbiGetLeoka, 'no_data');
        expect(http.calls).toHaveLength(1);
      });
    }
    for (const [label, payload] of Object.entries({
      objectEnvelope: {},
      numberEnvelope: 42,
      badEntry: [42],
      badWrapper: [{ [`leoka_chart_${period}`]: false }],
      badData: [{ [`leoka_chart_${period}`]: { data: [] } }],
      badChart: envelope(period, 'bad'),
      badTotals: envelope(period, { incidents_victim_officer_totals_ytd: [] }),
      badCount: envelope(period, { incidents_victim_officer_totals_ytd: { total_officers: '3' } }),
    })) {
      it(`${period} ${label} remains malformed rather than no_data`, async () => {
        reply(`/leoka/${period}`, payload);
        const result = await runToolContract(fbiGetLeoka, input);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          error: { code: JsonRpcErrorCode.SerializationError },
        });
        expect(text(result)).toContain('Malformed FBI');
        expect(text(result)).not.toContain('no_data');
      });
    }
  }
  for (const tool of [fbiGetCrimeEstimates]) {
    for (const [label, payload] of Object.entries({
      unknownOri: capture('unknown-ori'),
      nullOffenses: { offenses: null },
      emptyOffenses: { offenses: {} },
      emptyMaps: { offenses: { rates: {}, actuals: {} } },
      emptyActuals: {
        offenses: {
          rates: { 'Agency Offenses': { '01-2022': 99 } },
          actuals: { 'Agency Offenses': {} },
        },
      },
      nullActualSeries: {
        offenses: {
          rates: { 'Agency Offenses': { '01-2022': 99 } },
          actuals: { 'Agency Offenses': null },
        },
      },
    })) {
      it(`${tool.name} ${label} never falls back to comparison rates`, async () => {
        reply('/summarized/agency/CA0010400/robbery', payload);
        expectFailure(await runToolContract(tool, summarizedInput), tool, 'no_data');
      });
    }
    for (const payload of [
      { offenses: [] },
      { offenses: { actuals: 42 } },
      { offenses: { actuals: [] } },
      { offenses: { actuals: { 'Agency Offenses': [] } } },
      { offenses: { actuals: { 'Agency Offenses': { '01-2022': '9' } } } },
      { offenses: { rates: 42, actuals: {} } },
    ]) {
      it(`${tool.name} rejects malformed maps ${JSON.stringify(payload)}`, async () => {
        reply('/summarized/agency/CA0010400/robbery', payload);
        const result = await runToolContract(tool, summarizedInput);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          error: { code: JsonRpcErrorCode.SerializationError },
        });
        expect(text(result)).not.toContain('no_data');
      });
    }
    it(`${tool.name} retains zero and null counts with absent rates`, async () => {
      reply('/summarized/agency/CA0010400/robbery', {
        offenses: {
          rates: null,
          actuals: { 'Agency Offenses': { '01-2022': 0, '02-2022': null } },
        },
      });
      const result = await runToolContract(tool, summarizedInput);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        months: [
          { actual_count: 0, rate_per_100k: null, clearance_rate_per_100k: null },
          { actual_count: null, rate_per_100k: null },
        ],
      });
      expect(text(result)).toContain('| 2022 | 01 | — | — | 0 | — |');
      expect(text(result)).toContain('| 2022 | 02 | — | — | — | — |');
    });
    for (const scope of ['state', 'agency'] as const) {
      it(`${tool.name} carries scope_param_missing recovery for ${scope}`, async () => {
        expectFailure(
          await runToolContract(tool, {
            scope,
            offense: 'robbery',
            from_year: 2022,
            to_year: 2022,
          }),
          tool,
          'scope_param_missing',
        );
        expect(http.calls).toHaveLength(0);
      });
    }
  }
  it('keeps monthly HTTP 400 classified independently of absence', async () => {
    http.route({
      match: (request) => new URL(request.url).pathname === '/leoka/monthly',
      respond: new Response('Bad request, please ensure year is valid', { status: 400 }),
    });
    const result = await runToolContract(fbiGetLeoka, { period: 'monthly', year: 2024, month: 1 });
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.InvalidParams },
    });
    expect(text(result)).not.toContain('no_data');
    expect(http.calls).toHaveLength(1);
  });
  it('keeps invalid JSON distinct from absence', async () => {
    vi.useFakeTimers();
    http.route({
      match: (request) => new URL(request.url).pathname === '/leoka/ytd',
      respond: new Response('{bad json'),
    });
    const pending = runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
    await vi.advanceTimersByTimeAsync(60000);
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain('no_data');
  });
  it('carries month_required recovery without fetching', async () => {
    expectFailure(
      await runToolContract(fbiGetLeoka, { period: 'monthly', year: 2023 }),
      fbiGetLeoka,
      'month_required',
    );
    expect(http.calls).toHaveLength(0);
  });
  it('rejects invalid input without fetching', async () => {
    const result = await runToolContract(fbiGetLeoka, { period: 'monthly', year: 2023, month: 13 });
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
    });
    expect(http.calls).toHaveLength(0);
  });
});

describe('CDE cancellation and retry boundaries', () => {
  for (const kind of ['summarized', 'leoka'] as const) {
    it(`${kind} cancellation stops the pending fetch without no_data or success`, async () => {
      const controller = new AbortController();
      const started = Promise.withResolvers<void>();
      http.route({
        match: () => true,
        respond: (request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(request.signal.reason), {
              once: true,
            });
            started.resolve();
          }),
      });
      const pending =
        kind === 'summarized'
          ? runToolContract(fbiGetCrimeEstimates, summarizedInput, {
              context: { signal: controller.signal },
            })
          : runToolContract(
              fbiGetLeoka,
              { period: 'ytd', year: 2023 },
              { context: { signal: controller.signal } },
            );
      await started.promise;
      controller.abort(new DOMException('Caller cancelled', 'AbortError'));
      const result = await pending;
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.RequestCancelled },
      });
      expect(text(result)).toMatch(/cancel|abort/i);
      expect(text(result)).not.toContain('no_data');
      expect(http.calls).toHaveLength(1);
    });
  }
  it('retries a transient request and preserves populated denominators after recovery', async () => {
    vi.useFakeTimers();
    http.route({
      match: () => true,
      once: true,
      respond: new Response('Upstream unavailable', { status: 503 }),
    });
    http.route({
      match: () => true,
      once: true,
      respond: new Response('Upstream unavailable', { status: 503 }),
    });
    reply('/summarized/national/robbery', capture('national-jun2023'));
    const pending = runToolContract(fbiGetCrimeEstimates, {
      scope: 'national',
      offense: 'robbery',
      from_year: 2023,
      from_month: 6,
      to_year: 2023,
      to_month: 6,
    });
    await vi.advanceTimersByTimeAsync(60000);
    const result = await pending;
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      months: [
        {
          population: 338357687,
          participated_population: 324648689,
          population_coverage_percent: 95.95,
        },
      ],
    });
    expect(text(result)).toContain('95.95%');
    expect(http.calls).toHaveLength(3);
  });
});

describe('scoped populations and coverage (#19)', () => {
  for (const [scope, fixture, entity, population, participated, coverage] of [
    ['national', 'national-jun2023', 'United States', 338357687, 324648689, 95.95],
    ['state', 'state', 'California', 39029342, 38642850, 99.01],
    ['agency', 'agency', 'Emeryville Police Department', 12781, 12781, null],
  ] as const) {
    it(`preserves provider-only ${scope} denominators on both surfaces`, async () => {
      const path =
        scope === 'national' ? 'national' : `${scope}/${scope === 'state' ? 'CA' : 'CA0010400'}`;
      reply(`/summarized/${path}/robbery`, capture(fixture));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope,
        ori: scope === 'agency' ? 'CA0010400' : undefined,
        ...(scope === 'state' && { state_abbr: 'CA' }),
        ...(scope === 'national' && { from_year: 2023, to_year: 2023, from_month: 6, to_month: 6 }),
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        entity_name: entity,
        max_data_date: '09/2026',
        months: [
          {
            population,
            participated_population: participated,
            population_coverage_percent: coverage,
          },
        ],
      });
      expect(text(result)).toContain(entity);
      expect(text(result)).toContain('09/2026');
      expect(text(result)).toContain(
        `${population.toLocaleString()} | ${participated.toLocaleString()} | ${coverage === null ? '—' : `${coverage}%`}`,
      );
      expect(text(result)).toMatch(/coverage.*(incomplete|unavailable)/i);
      expect(http.calls).toHaveLength(1);
    });
  }
  const offensePayload = {
    offenses: { actuals: { 'Agency Offenses': { '02-2022': 1, '01-2022': 0 } } },
  };
  for (const [name, fields] of Object.entries({
    omitted: {},
    nullGroups: { populations: null, tooltips: null },
    emptyGroups: { populations: {}, tooltips: {} },
    nullMaps: {
      populations: { population: null, participated_population: null },
      tooltips: { 'Percent of Population Coverage': null },
    },
    emptyMaps: {
      populations: { population: {}, participated_population: {} },
      tooltips: { 'Percent of Population Coverage': {} },
    },
    nullEntity: {
      populations: { population: { Agency: null }, participated_population: { Agency: null } },
      tooltips: { 'Percent of Population Coverage': { Agency: null } },
    },
    emptyEntity: {
      populations: { population: { Agency: {} }, participated_population: { Agency: {} } },
      tooltips: { 'Percent of Population Coverage': { Agency: {} } },
    },
    missingMonths: {
      populations: {
        population: { Agency: { '03-2022': 99 } },
        participated_population: { Agency: { '03-2022': 90 } },
      },
      tooltips: { 'Percent of Population Coverage': { Agency: { '03-2022': 90.91 } } },
    },
    comparisonOnly: {
      populations: {
        population: { 'United States': { '01-2022': 99 } },
        participated_population: { 'United States': { '01-2022': 90 } },
      },
      tooltips: { 'Percent of Population Coverage': { 'United States': { '01-2022': 90.91 } } },
    },
    nullLeaves: {
      populations: {
        population: { Agency: { '01-2022': null } },
        participated_population: { Agency: { '01-2022': null } },
      },
      tooltips: { 'Percent of Population Coverage': { Agency: { '01-2022': null } } },
    },
  })) {
    it(`${name} retains nullable fields without adding denominator-only months`, async () => {
      reply('/summarized/agency/CA0010400/robbery', { ...offensePayload, ...fields });
      const result = await runToolContract(fbiGetCrimeEstimates, summarizedInput);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        entity_name: 'Agency',
        total_months: 2,
        months: [
          {
            month: 1,
            population: null,
            participated_population: null,
            population_coverage_percent: null,
          },
          {
            month: 2,
            population: null,
            participated_population: null,
            population_coverage_percent: null,
          },
        ],
      });
      expect(result.structuredContent).not.toHaveProperty('max_data_date');
      expect(text(result)).toContain('| 0 | — | — | — | — |');
    });
  }
  it('selects own denominator keys despite comparison-first ordering and preserves zero', async () => {
    reply('/summarized/agency/CA0010400/robbery', {
      ...offensePayload,
      populations: {
        population: { Other: { '01-2022': 900 }, Agency: { '01-2022': 0, '02-2022': 50 } },
        participated_population: {
          Other: { '01-2022': 850 },
          Agency: { '01-2022': 0, '02-2022': 20 },
        },
      },
      tooltips: {
        'Percent of Population Coverage': {
          Other: { '01-2022': 94 },
          Agency: { '01-2022': 0, '02-2022': 42.5 },
        },
      },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, summarizedInput);
    expect(result.structuredContent).toMatchObject({
      months: [
        { month: 1, population: 0, participated_population: 0, population_coverage_percent: 0 },
        {
          month: 2,
          population: 50,
          participated_population: 20,
          population_coverage_percent: 42.5,
        },
      ],
    });
    expect(text(result)).toContain('| 0 | 0 | 0% |');
    expect(text(result)).toContain('| 50 | 20 | 42.5% |');
  });
  for (const field of ['population', 'participated_population', 'coverage'] as const) {
    for (const bad of ['9', false, [], {}]) {
      it(`rejects malformed ${field} leaf ${JSON.stringify(bad)} rather than converting to null`, async () => {
        const map = { Agency: { '01-2022': bad } };
        reply('/summarized/agency/CA0010400/robbery', {
          ...offensePayload,
          ...(field === 'coverage'
            ? { tooltips: { 'Percent of Population Coverage': map } }
            : { populations: { [field]: map } }),
        });
        const result = await runToolContract(fbiGetCrimeEstimates, summarizedInput);
        expect(result.structuredContent).toMatchObject({
          error: { code: JsonRpcErrorCode.SerializationError },
        });
        expect(text(result)).toContain('Malformed FBI');
        expect(text(result)).not.toContain('no_data');
        expect(http.calls).toHaveLength(1);
      });
    }
  }
  it('escapes upstream entity markup only in text and retains its structured name', async () => {
    const entity = '<img src=x onerror=alert(1)>\n[link](https://evil.test)|*';
    reply('/summarized/agency/CA0010400/robbery', {
      offenses: { actuals: { [`${entity} Offenses`]: { '01-2022': 0 } } },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, summarizedInput);
    expect(result.structuredContent).toHaveProperty('entity_name', entity);
    expect(text(result)).not.toMatch(/(?<!\\)<img/);
    expect(text(result)).not.toContain('\n[link]');
    expect(text(result)).toContain('\\[link\\]');
  });
  it('renders provider precision without rounding the new numeric fields', async () => {
    reply('/summarized/agency/CA0010400/robbery', {
      ...offensePayload,
      populations: {
        population: { Agency: { '01-2022': 100.125 } },
        participated_population: { Agency: { '01-2022': 50.0625 } },
      },
      tooltips: { 'Percent of Population Coverage': { Agency: { '01-2022': 49.98765 } } },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, summarizedInput);
    expect(result.structuredContent).toMatchObject({
      months: [
        {
          population: 100.125,
          participated_population: 50.0625,
          population_coverage_percent: 49.98765,
        },
        { population: null, participated_population: null, population_coverage_percent: null },
      ],
    });
    expect(text(result)).toContain('| 100.125 | 50.0625 | 49.98765% |');
  });
});

describe('identifier syntax and casing (#17)', () => {
  for (const [scope, field, supplied, normalized] of [
    ['state', 'state_abbr', 'ca', 'CA'],
    ['state', 'state_abbr', 'dc', 'DC'],
    ['state', 'state_abbr', 'pr', 'PR'],
    ['agency', 'ori', 'ca0010400', 'CA0010400'],
    ['agency', 'ori', 'dcmpd0000', 'DCMPD0000'],
  ] as const) {
    it(`normalizes ${supplied} without dropping internal zeros or excluding territories`, async () => {
      http.route({
        match: () => true,
        respond: Response.json(capture(scope === 'state' ? 'state' : 'agency')),
      });
      const result = await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope,
        ori: undefined,
        [field]: supplied,
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toHaveProperty(field, normalized);
      expect(text(result)).toContain(normalized);
      expect(new URL(http.calls[0]!.request.url).pathname).toContain(`/${normalized}/`);
      expect(http.calls).toHaveLength(1);
    });
  }
  for (const [scope, field, identifier] of [
    ['state', 'state_abbr', 'C1'],
    ['state', 'state_abbr', 'ÇA'],
    ['state', 'state_abbr', ' CA'],
    ['state', 'state_abbr', 'C\n'],
    ['agency', 'ori', 'CA00104!0'],
    ['agency', 'ori', 'ＣA0010400'],
    ['agency', 'ori', 'CA001040\n'],
    ['agency', 'ori', 'CA001040'],
  ] as const) {
    it(`rejects malformed ${field}=${JSON.stringify(identifier)} locally`, async () => {
      reply(`/summarized/${scope}/${encodeURIComponent(identifier)}/robbery`, capture('agency'));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope,
        ori: undefined,
        [field]: identifier,
      });
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
      });
      expect(text(result)).toContain(field);
      expect(http.calls).toHaveLength(0);
    });
  }
  it('reads blank identifiers from form clients as unset', async () => {
    reply('/summarized/national/robbery', capture('national-jun2023'));
    const national = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'national',
      offense: 'robbery',
      state_abbr: '',
      ori: '',
      from_year: 2023,
      from_month: 6,
      to_year: 2023,
      to_month: 6,
    });
    expect(national.isError).not.toBe(true);
    expect(national.structuredContent).not.toHaveProperty('state_abbr');
    expect(http.calls).toHaveLength(1);
    catchAllRequests();
    expectFailure(
      await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope: 'state',
        ori: '',
        state_abbr: '',
      }),
      fbiGetCrimeEstimates,
      'scope_param_missing',
    );
    expect(http.calls).toHaveLength(1);
  });
  it('keeps well-formed unknown identifiers as no_data with identifier-first recovery', async () => {
    http.route({ match: () => true, respond: Response.json(capture('unknown-ori')) });
    const result = await runToolContract(fbiGetCrimeEstimates, {
      ...summarizedInput,
      ori: 'xx9999999',
    });
    expectFailure(result, fbiGetCrimeEstimates, 'no_data');
    expect(text(result)).toMatch(/Verify.*ori.*offense/i);
    expect(http.calls).toHaveLength(1);
  });
});

describe('applied selectors (#16)', () => {
  for (const selectors of [
    { scope: 'national', state_abbr: 'CA' },
    { scope: 'national', ori: 'CA0010400' },
    { scope: 'national', state_abbr: 'CA', ori: 'CA0010400' },
    { scope: 'state', state_abbr: 'CA', ori: 'CA0010400' },
    { scope: 'agency', state_abbr: 'CA', ori: 'CA0010400' },
  ]) {
    it(`rejects ignored selectors ${JSON.stringify(selectors)} without fetching`, async () => {
      for (const path of [
        '/summarized/national/robbery',
        '/summarized/state/CA/robbery',
        '/summarized/agency/CA0010400/robbery',
      ])
        reply(path, capture('state'));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        offense: 'robbery',
        from_year: 2022,
        to_year: 2022,
        ...selectors,
      });
      expect(result.isError).toBe(true);
      expectFailure(result, fbiGetCrimeEstimates, 'scope_param_incompatible');
      expect(http.calls).toHaveLength(0);
    });
  }
  it('rejects month with YTD without fetching or a monthly heading', async () => {
    reply('/leoka/ytd', capture('ytd-2023'));
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023, month: 6 });
    expect(result.isError).toBe(true);
    expectFailure(result, fbiGetLeoka, 'month_not_applicable');
    expect(text(result)).not.toContain('2023-06');
    expect(http.calls).toHaveLength(0);
  });
});

describe('summarized date validation (#15)', () => {
  for (const range of [
    { from_year: 2024, to_year: 2023 },
    { from_year: 2023, from_month: 7, to_year: 2023, to_month: 6 },
  ]) {
    it(`rejects reversed endpoints ${JSON.stringify(range)} before fetching`, async () => {
      reply('/summarized/national/robbery', capture('state'));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        scope: 'national',
        offense: 'robbery',
        ...range,
      });
      expect(result.isError).toBe(true);
      expectFailure(result, fbiGetCrimeEstimates, 'invalid_date_range');
      expect(text(result)).toContain('from_year');
      expect(text(result)).toContain('to_month');
      expect(http.calls).toHaveLength(0);
    });
  }
  for (const range of [
    { from_year: 2022, from_month: 1, to_year: 2022, to_month: 1 },
    { from_year: 2022, to_year: 2023 },
    { from_year: 2022, from_month: 12, to_year: 2023, to_month: 1 },
  ]) {
    it(`accepts equal or forward endpoints ${JSON.stringify(range)}`, async () => {
      reply('/summarized/national/robbery', capture('state'));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        scope: 'national',
        offense: 'robbery',
        ...range,
      });
      expect(result.isError).not.toBe(true);
      expect(http.calls).toHaveLength(1);
      const url = new URL(http.calls[0]!.request.url);
      expect(url.searchParams.get('from')).toBe(
        `${String(range.from_month ?? 1).padStart(2, '0')}-${range.from_year}`,
      );
      expect(url.searchParams.get('to')).toBe(
        `${String(range.to_month ?? 12).padStart(2, '0')}-${range.to_year}`,
      );
    });
  }
});

describe('faithful LEOKA totals and breakdowns (#8, #6)', () => {
  for (const period of ['ytd', 'monthly'] as const) {
    it(`${period} preserves every raw total and all thirteen breakdowns`, async () => {
      const payload = capture(period === 'ytd' ? 'ytd-2023' : 'monthly-2023-6') as Record<
        string,
        { data: { chart_data: Record<string, unknown> } }
      >[];
      const chart = payload[0]![`leoka_chart_${period}`]!.data.chart_data;
      reply(`/leoka/${period}`, payload);
      const result = await runToolContract(fbiGetLeoka, {
        period,
        year: 2023,
        ...(period === 'monthly' && { month: 6 }),
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent?.totals).toEqual(chart.incidents_victim_officer_totals_ytd);
      const rendered = text(result);
      expect(rendered).toContain(`| CDE YTD total officers | ${period === 'ytd' ? 60 : 30} |`);
      expect(rendered).toContain(`| CDE YTD total incidents | ${period === 'ytd' ? 59 : 30} |`);
      for (const [key, value] of Object.entries(
        chart.incidents_victim_officer_totals_ytd as Record<string, number>,
      )) {
        if (key.endsWith('_dod') || key.endsWith('_doi'))
          expect(rendered).toContain(`| ${key} | ${value} |`);
      }
      expect(rendered).not.toMatch(
        /Officers feloniously killed|Officers accidentally killed|Officers killed \(total\)/,
      );
      for (const key of newFields) {
        // Monthly officer_death_by_month keeps only the requested month; CDE zero-fills the rest.
        const expected =
          period === 'monthly' && key === 'officer_death_by_month'
            ? {
                Felonious: { '2022': { Jun: 12 }, '2023': { Jun: 6 } },
                Accidental: { '2022': { Jun: 4 }, '2023': { Jun: 2 } },
              }
            : chart[key];
        expect(result.structuredContent?.[key]).toEqual(expected);
        const section = rendered.split(`### ${key}\n`)[1]?.split('\n### ')[0];
        expect(section, key).toBeDefined();
        const verifyPaths = (value: unknown, path: string[] = []): void => {
          if (typeof value === 'number')
            expect(section).toContain(`| ${[...path, String(value)].join(' | ')} |`);
          else
            for (const [child, count] of Object.entries(value as Record<string, unknown>))
              verifyPaths(count, [...path, child]);
        };
        verifyPaths(expected);
      }
      expect(rendered).toContain('| Felonious | -1 |');
      expect(rendered).toContain('| Felonious | 2022 | Jun | 12 |');
      expect(rendered).toContain('| Accidental | 2023 | Jun | 2 |');
      if (period === 'monthly') {
        expect(rendered).not.toContain('| Felonious | 2022 | Jan |');
        expect(rendered).not.toContain('| Accidental | 2023 | Dec |');
      }
      expect(rendered).not.toMatch(/\[object Object\]|NaN/);
      expect(http.calls).toHaveLength(1);
    });
  }
  for (const key of newFields) {
    it(`${key} omits null sections but preserves empty maps`, async () => {
      reply(
        '/leoka/ytd',
        envelope('ytd', { incidents_victim_officer_totals_ytd: {}, [key]: null }),
      );
      const absent = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
      expect(absent.isError).not.toBe(true);
      expect(absent.structuredContent).not.toHaveProperty(key);
      http.reset();
      reply('/leoka/ytd', envelope('ytd', { incidents_victim_officer_totals_ytd: {}, [key]: {} }));
      const empty = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
      expect(empty.structuredContent).toHaveProperty(key, {});
      expect(text(empty)).toContain(`### ${key}\n`);
      expect(text(empty)).toContain('No reported entries');
    });
    it(`${key} rejects nonnumeric leaves`, async () => {
      const bad = flatFields.some((field) => field === key)
        ? { category: 'bad' }
        : key === 'officer_death_by_month'
          ? { Future: { '2030': { Jan: 'bad' } } }
          : { Future: { category: 'bad' } };
      reply('/leoka/ytd', envelope('ytd', { incidents_victim_officer_totals_ytd: {}, [key]: bad }));
      const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.SerializationError },
      });
    });
  }
  it('preserves sparse nested paths, unknown keys, literal hours, nulls and zeros', async () => {
    const chart = {
      incidents_victim_officer_totals_ytd: { total_officers: 0, total_officers_dod: 0 },
      body_armor_worn: { 'Future | category\nline': 0, Unknown: null },
      offender_demographic: {
        future_dimension: { Zero: 0, Missing: null },
        absent_group: null,
        empty_group: {},
      },
      officer_demographic: { future_dimension: { Other: 3 } },
      officer_death_by_time_of_day: { Future: { '-1': 0, '00': null }, missing: null, empty: {} },
      officer_death_by_month: {
        Future: { '2021': { Jun: 0, Jul: null }, '2022': null, '2023': {} },
        missing: null,
        empty: {},
      },
    };
    reply('/leoka/ytd', envelope('ytd', chart));
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      totals: chart.incidents_victim_officer_totals_ytd,
      body_armor_worn: chart.body_armor_worn,
      offender_demographic: chart.offender_demographic,
      officer_demographic: chart.officer_demographic,
      officer_death_by_time_of_day: chart.officer_death_by_time_of_day,
      officer_death_by_month: chart.officer_death_by_month,
    });
    expect(result.structuredContent?.totals).not.toHaveProperty('total_incidents');
    for (const row of [
      '| Future \\| category<br>line | 0 |',
      '| Unknown | Unavailable |',
      '| future_dimension | Missing | Unavailable |',
      '| absent_group | — | Unavailable |',
      '| empty_group | — | No reported entries |',
      '| Future | -1 | 0 |',
      '| Future | 00 | Unavailable |',
      '| Future | 2021 | Jun | 0 |',
      '| Future | 2021 | Jul | Unavailable |',
      '| Future | 2022 | — | Unavailable |',
      '| Future | 2023 | — | No reported entries |',
      '| missing | — | — | Unavailable |',
      '| empty | — | — | No reported entries |',
    ])
      expect(text(result)).toContain(row);
  });
  for (const size of [5000, 20000, 80000]) {
    it(`renders a ${size}-character category without dropping or scanning superlinearly`, async () => {
      const key = '|\n'.repeat(size / 2);
      reply(
        '/leoka/ytd',
        envelope('ytd', { incidents_victim_officer_totals_ytd: {}, body_armor_worn: { [key]: 0 } }),
      );
      const started = performance.now();
      const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2023 });
      expect(result.isError).not.toBe(true);
      expect(text(result)).toContain(`${'\\|<br>'.repeat(size / 2)} | 0 |`);
      expect(performance.now() - started).toBeLessThan(2000);
    });
  }
});

/** Pin the wall clock (Date only; timers stay real so fetch routing is unaffected). */
function pinDate(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('LEOKA month coverage (#22)', () => {
  it('monthly keeps only the requested month, genuine zeros and null groups included', async () => {
    const chart = {
      incidents_victim_officer_totals_ytd: { total_officers: 0 },
      weapons: { Handguns: 0 },
      officer_death_by_month: {
        Future: {
          '2022': { Jan: 0, Jun: 0, Dec: 0, Extra: 3 },
          '2023': null,
          '2021': {},
          '2020': { Jan: 5 },
        },
        missing: null,
        empty: {},
      },
    };
    reply('/leoka/monthly', envelope('monthly', chart));
    const result = await runToolContract(fbiGetLeoka, { period: 'monthly', year: 2022, month: 6 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ weapons: { Handguns: 0 } });
    expect(result.structuredContent?.officer_death_by_month).toEqual({
      Future: { '2022': { Jun: 0 }, '2023': null, '2021': {}, '2020': {} },
      missing: null,
      empty: {},
    });
    const rendered = text(result);
    for (const row of [
      '| Future | 2022 | Jun | 0 |',
      '| Future | 2023 | — | Unavailable |',
      '| Future | 2021 | — | No reported entries |',
      '| Future | 2020 | — | No reported entries |',
      '| missing | — | — | Unavailable |',
    ])
      expect(rendered).toContain(row);
    expect(rendered).not.toMatch(/\| Future \| 20\d\d \| (Jan|Dec|Extra) \|/);
  });
  it('current-year YTD drops months after the current UTC month from both years', async () => {
    pinDate('2026-10-22T12:00:00Z');
    reply('/leoka/ytd', capture('ytd-2026'));
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2026 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.officer_death_by_month).toEqual({
      Felonious: {
        '2025': { Jan: 3, Feb: 7, Mar: 5, Apr: 2, May: 4, Jun: 6, Jul: 5, Aug: 6, Sep: 4, Oct: 4 },
        '2026': { Jan: 3, Feb: 5, Mar: 2, Apr: 6, May: 4, Jun: 1, Jul: 5, Aug: 2, Sep: 3, Oct: 3 },
      },
      Accidental: {
        '2025': { Jan: 3, Feb: 1, Mar: 0, Apr: 3, May: 1, Jun: 3, Jul: 4, Aug: 2, Sep: 3, Oct: 4 },
        '2026': { Jan: 5, Feb: 5, Mar: 1, Apr: 4, May: 4, Jun: 4, Jul: 1, Aug: 3, Sep: 3, Oct: 3 },
      },
    });
    expect(result.structuredContent).toMatchObject({
      deaths_by_year: { Felonious: { '2025': 53, '2026': 34 }, Accidental: { '2025': 28 } },
    });
    const rendered = text(result);
    expect(rendered).toContain('| Accidental | 2025 | Mar | 0 |');
    expect(rendered).toContain('| Felonious | 2026 | Oct | 3 |');
    expect(rendered).not.toMatch(/\| (Felonious|Accidental) \| 202[56] \| (Nov|Dec) \|/);
  });
  for (const [now, kept] of [
    ['2026-01-01T00:00:00Z', ['Jan']],
    ['2026-12-31T23:59:59.999Z', null],
    ['2027-01-01T00:00:00Z', null],
  ] as const) {
    it(`YTD 2026 at ${now} keeps ${kept ? kept.join(', ') : 'every month'}`, async () => {
      pinDate(now);
      const payload = capture('ytd-2026') as Record<
        string,
        {
          data: {
            chart_data: Record<string, Record<string, Record<string, Record<string, number>>>>;
          };
        }
      >[];
      const series = payload[0]!.leoka_chart_ytd!.data.chart_data.officer_death_by_month!;
      reply('/leoka/ytd', payload);
      const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2026 });
      expect(result.isError).not.toBe(true);
      const months = result.structuredContent?.officer_death_by_month as typeof series;
      for (const type of ['Felonious', 'Accidental'])
        for (const year of ['2025', '2026'])
          expect(Object.keys(months[type]![year]!).sort()).toEqual(
            [...(kept ?? Object.keys(series[type]![year]!))].sort(),
          );
      if (kept) expect(months.Felonious?.['2025']).toEqual({ Jan: 3 });
      else expect(months).toEqual(series);
    });
  }
  it('past-year YTD keeps trailing zero months', async () => {
    pinDate('2026-10-22T12:00:00Z');
    const chart = {
      incidents_victim_officer_totals_ytd: {},
      officer_death_by_month: { Felonious: { '2024': { Oct: 0, Nov: 5, Dec: 0, Extra: 1 } } },
    };
    reply('/leoka/ytd', envelope('ytd', chart));
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2024 });
    expect(result.structuredContent?.officer_death_by_month).toEqual(chart.officer_death_by_month);
    expect(text(result)).toContain('| Felonious | 2024 | Dec | 0 |');
  });
  it('current-year YTD keeps unrecognized month keys and null groups', async () => {
    pinDate('2026-03-05T00:00:00Z');
    reply(
      '/leoka/ytd',
      envelope('ytd', {
        incidents_victim_officer_totals_ytd: {},
        officer_death_by_month: {
          Future: { '2025': { Mar: 0, Apr: 0, Extra: 2 }, '2026': null },
          missing: null,
        },
      }),
    );
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2026 });
    expect(result.structuredContent?.officer_death_by_month).toEqual({
      Future: { '2025': { Mar: 0, Extra: 2 }, '2026': null },
      missing: null,
    });
  });
});

describe('CDE year windows (#23)', () => {
  for (const [scope, path, entity] of [
    ['national', '/summarized/national/robbery', 'United States'],
    ['state', '/summarized/state/CA/robbery', 'California'],
    ['agency', '/summarized/agency/CA0010400/robbery', 'Emeryville Police Department'],
  ] as const) {
    it(`accepts the 1985 floor at ${scope} scope`, async () => {
      reply(path, { offenses: { actuals: { [`${entity} Offenses`]: { '01-1985': 8 } } } });
      const result = await runToolContract(fbiGetCrimeEstimates, {
        scope,
        offense: 'robbery',
        ...(scope === 'state' && { state_abbr: 'CA' }),
        ...(scope === 'agency' && { ori: 'CA0010400' }),
        from_year: 1985,
        from_month: 1,
        to_year: 1985,
        to_month: 1,
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ months: [{ year: 1985, actual_count: 8 }] });
      expect(text(result)).toContain('| 1985 | 01 |');
      expect(new URL(http.calls[0]!.request.url).searchParams.get('from')).toBe('01-1985');
      expect(http.calls).toHaveLength(1);
    });
  }
  for (const field of ['from_year', 'to_year'] as const) {
    it(`rejects ${field} 1984 in the schema without fetching`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetCrimeEstimates, {
        scope: 'national',
        offense: 'robbery',
        from_year: 1985,
        to_year: 1985,
        [field]: 1984,
      });
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
      });
      expect(text(result)).toContain(field);
      expect(text(result)).toContain('1985');
      expect(http.calls).toHaveLength(0);
    });
  }
  for (const period of ['ytd', 'monthly'] as const) {
    it(`rejects LEOKA ${period} 2019 in the schema without fetching`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetLeoka, {
        period,
        year: 2019,
        ...(period === 'monthly' && { month: 12 }),
      });
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
      });
      expect(text(result)).toContain('2020');
      expect(http.calls).toHaveLength(0);
    });
    it(`accepts LEOKA ${period} 2020`, async () => {
      reply(
        `/leoka/${period}`,
        envelope(period, { incidents_victim_officer_totals_ytd: { total_officers: 1 } }),
      );
      const result = await runToolContract(fbiGetLeoka, {
        period,
        year: 2020,
        ...(period === 'monthly' && { month: 1 }),
      });
      expect(result.isError).not.toBe(true);
      expect(new URL(http.calls[0]!.request.url).searchParams.get('year')).toBe('2020');
    });
  }

  /** year_out_of_range on both surfaces with the window in the hint, before any fetch. */
  function expectOutOfRange(
    result: Awaited<ReturnType<typeof runToolContract>>,
    tool: typeof fbiGetLeoka | typeof fbiGetCrimeEstimates,
    window: string,
  ): void {
    const contract = tool.errors?.find((entry) => entry.reason === 'year_out_of_range');
    expect(contract).toBeDefined();
    expect(contract?.recovery).toContain(window.split(' ')[0]);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: contract?.code,
        data: { reason: 'year_out_of_range', recovery: { hint: expect.stringContaining(window) } },
      },
    });
    expect(text(result)).toContain('year_out_of_range');
    expect(text(result)).toContain(window);
    expect(http.calls).toHaveLength(0);
  }
  for (const range of [
    { from_year: 2026, to_year: 2027 },
    { from_year: 2027, to_year: 2027 },
    { from_year: 2027, to_year: 2026 },
  ]) {
    it(`summarized ${JSON.stringify(range)} fails year_out_of_range in 2026`, async () => {
      pinDate('2026-10-22T12:00:00Z');
      catchAllRequests();
      expectOutOfRange(
        await runToolContract(fbiGetCrimeEstimates, {
          scope: 'national',
          offense: 'robbery',
          ...range,
        }),
        fbiGetCrimeEstimates,
        '1985 through 2026',
      );
    });
  }
  for (const period of ['ytd', 'monthly'] as const) {
    it(`LEOKA ${period} 2027 fails year_out_of_range in 2026`, async () => {
      pinDate('2026-10-22T12:00:00Z');
      catchAllRequests();
      expectOutOfRange(
        await runToolContract(fbiGetLeoka, {
          period,
          year: 2027,
          ...(period === 'monthly' && { month: 1 }),
        }),
        fbiGetLeoka,
        '2020 through 2026',
      );
    });
  }
  it('summarized current year past the latest data keeps null rows', async () => {
    pinDate('2026-10-22T12:00:00Z');
    reply('/summarized/national/robbery', capture('national-2026'));
    const result = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'national',
      offense: 'robbery',
      from_year: 2026,
      to_year: 2026,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ total_months: 12, max_data_date: '10/2026' });
    const months = (result.structuredContent as { months: Record<string, unknown>[] }).months;
    expect(months[9]).toMatchObject({ month: 10, actual_count: 625, rate_per_100k: 0.98 });
    expect(months[10]).toEqual({
      year: 2026,
      month: 11,
      rate_per_100k: null,
      clearance_rate_per_100k: null,
      actual_count: null,
      clearance_count: null,
      population: 345206793,
      participated_population: null,
      population_coverage_percent: null,
    });
    expect(text(result)).toContain('| 2026 | 12 | — | — | — | — | 345,206,793 | — | — |');
  });
  for (const [now, accepted] of [
    ['2026-12-31T23:59:59.999Z', false],
    ['2027-01-01T00:00:00Z', true],
  ] as const) {
    it(`2027 is ${accepted ? 'accepted' : 'rejected'} at ${now} on both tools`, async () => {
      pinDate(now);
      reply('/summarized/national/robbery', {
        offenses: { actuals: { 'United States Offenses': { '01-2027': null } } },
      });
      reply('/leoka/ytd', envelope('ytd', { incidents_victim_officer_totals_ytd: {} }));
      catchAllRequests();
      const summarized = await runToolContract(fbiGetCrimeEstimates, {
        scope: 'national',
        offense: 'robbery',
        from_year: 2027,
        to_year: 2027,
      });
      const leoka = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2027 });
      if (accepted) {
        expect(summarized.isError).not.toBe(true);
        expect(leoka.isError).not.toBe(true);
        expect(http.calls).toHaveLength(2);
      } else {
        expectOutOfRange(summarized, fbiGetCrimeEstimates, '1985 through 2026');
        expectOutOfRange(leoka, fbiGetLeoka, '2020 through 2026');
      }
    });
  }
  it('LEOKA no_data recovery names the 2020 start without a lag claim', async () => {
    reply('/leoka/ytd', [{ leoka_chart_ytd: null }]);
    const result = await runToolContract(fbiGetLeoka, { period: 'ytd', year: 2024 });
    expectFailure(result, fbiGetLeoka, 'no_data');
    const recovery = fbiGetLeoka.errors?.find((entry) => entry.reason === 'no_data')?.recovery;
    expect(recovery).toContain('2020');
    expect(recovery).not.toMatch(/lag/i);
  });
});

describe('comparison rates (#24)', () => {
  const comparisonInput = { ...summarizedInput, include_comparisons: true };
  it('returns the agency state and national rates in CDE order', async () => {
    reply('/summarized/agency/TXSPD0000/homicide', capture('agency-txspd-homicide-202401'));
    const result = await runToolContract(fbiGetCrimeEstimates, {
      ...comparisonInput,
      ori: 'TXSPD0000',
      offense: 'homicide',
      from_year: 2024,
      to_year: 2024,
      to_month: 1,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      entity_name: 'San Antonio Police Department',
      months: [{ year: 2024, month: 1, rate_per_100k: 0.53, clearance_rate_per_100k: 0.2 }],
    });
    expect(result.structuredContent?.comparisons).toEqual([
      {
        entity_name: 'Texas',
        months: [
          {
            year: 2024,
            month: 1,
            rate_per_100k: 0.47,
            clearance_rate_per_100k: 0.28,
            population: 31290831,
            participated_population: 31074446,
            population_coverage_percent: 99.31,
          },
        ],
      },
      {
        entity_name: 'United States',
        months: [
          {
            year: 2024,
            month: 1,
            rate_per_100k: 0.41,
            clearance_rate_per_100k: 0.25,
            population: 343551384,
            participated_population: 332363574,
            population_coverage_percent: 96.74,
          },
        ],
      },
    ]);
    const rendered = text(result);
    expect(rendered).toContain('| 2024 | 01 | 0.53 | 0.2 | 8 | 3 |');
    expect(rendered).toContain('### Comparison: Texas');
    expect(rendered).toContain('| 2024 | 01 | 0.47 | 0.28 | 31,290,831 | 31,074,446 | 99.31% |');
    expect(rendered).toContain('### Comparison: United States');
    expect(rendered).toContain('| 2024 | 01 | 0.41 | 0.25 | 343,551,384 | 332,363,574 | 96.74% |');
    expect(rendered.indexOf('Comparison: Texas')).toBeLessThan(
      rendered.indexOf('Comparison: United States'),
    );
    expect(http.calls).toHaveLength(1);
  });
  it('carries comparison coverage while the agency coverage stays null', async () => {
    reply('/summarized/agency/CA0010400/robbery', capture('agency'));
    const result = await runToolContract(fbiGetCrimeEstimates, comparisonInput);
    expect(result.structuredContent).toMatchObject({
      months: [{ rate_per_100k: 70.42, population_coverage_percent: null }],
      comparisons: [
        { entity_name: 'California', months: [{ population_coverage_percent: 99.01 }] },
        { entity_name: 'United States', months: [{ population_coverage_percent: 93.61 }] },
      ],
    });
    expect(text(result)).toContain('| 2022 | 01 | 70.42 | 15.65 | 9 | 2 | 12,781 | 12,781 | — |');
    expect(text(result)).toContain(
      '| 2022 | 01 | 5.9 | 1.35 | 336,746,447 | 315,231,910 | 93.61% |',
    );
  });
  it('returns the nation for state scope', async () => {
    reply('/summarized/state/CA/robbery', capture('state'));
    const result = await runToolContract(fbiGetCrimeEstimates, {
      ...comparisonInput,
      scope: 'state',
      ori: undefined,
      state_abbr: 'ca',
    });
    expect(result.structuredContent).toMatchObject({
      months: [{ rate_per_100k: 10.89 }],
      comparisons: [{ entity_name: 'United States', months: [{ rate_per_100k: 5.9 }] }],
    });
    expect(result.structuredContent?.comparisons).toHaveLength(1);
    expect(text(result)).toContain('### Comparison: United States');
    expect(text(result)).not.toContain('### Comparison: California');
  });
  for (const [scope, path, fixture] of [
    ['state', '/summarized/state/CA/robbery', 'state'],
    ['agency', '/summarized/agency/CA0010400/robbery', 'agency'],
  ] as const) {
    it(`include_comparisons=false keeps the default ${scope} output byte-identical`, async () => {
      reply(path, capture(fixture));
      const result = await runToolContract(fbiGetCrimeEstimates, {
        ...summarizedInput,
        scope,
        ...(scope === 'state' && { ori: undefined, state_abbr: 'CA' }),
        include_comparisons: false,
      });
      expect(JSON.stringify(result.structuredContent)).toBe(
        JSON.stringify(PINNED[scope].structured),
      );
      expect(text(result)).toBe(PINNED[scope].text);
    });
  }
  it('rejects include_comparisons on national scope without fetching', async () => {
    catchAllRequests();
    const result = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'national',
      offense: 'robbery',
      from_year: 2023,
      to_year: 2023,
      include_comparisons: true,
    });
    expectFailure(result, fbiGetCrimeEstimates, 'scope_param_incompatible');
    expect(text(result)).toContain('include_comparisons');
    expect(http.calls).toHaveLength(0);
  });
  it('covers exactly the scoped months, keeping nulls and zeros', async () => {
    reply('/summarized/agency/CA0010400/robbery', {
      offenses: {
        actuals: { 'Agency Offenses': { '02-2022': 1, '01-2022': 0 } },
        rates: {
          'State Offenses': { '01-2022': 0, '03-2022': 7 },
          'State Clearances': { '01-2022': null },
          'Agency Offenses': { '01-2022': 0, '02-2022': 4 },
          'Nation Offenses': { '02-2022': 2 },
        },
      },
      populations: {
        population: { State: { '01-2022': 0, '03-2022': 9 }, Nation: null },
        participated_population: { State: { '01-2022': null } },
      },
      tooltips: { 'Percent of Population Coverage': { Nation: { '02-2022': 0, '03-2022': 50 } } },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, comparisonInput);
    expect(result.isError).not.toBe(true);
    const nulls = {
      rate_per_100k: null,
      clearance_rate_per_100k: null,
      population: null,
      participated_population: null,
      population_coverage_percent: null,
    };
    expect(result.structuredContent?.comparisons).toEqual([
      {
        entity_name: 'State',
        months: [
          { ...nulls, year: 2022, month: 1, rate_per_100k: 0, population: 0 },
          { ...nulls, year: 2022, month: 2 },
        ],
      },
      {
        entity_name: 'Nation',
        months: [
          { ...nulls, year: 2022, month: 1 },
          { ...nulls, year: 2022, month: 2, rate_per_100k: 2, population_coverage_percent: 0 },
        ],
      },
    ]);
    expect(result.structuredContent).toMatchObject({
      months: [
        { month: 1, rate_per_100k: 0 },
        { month: 2, rate_per_100k: 4 },
      ],
    });
    expect(text(result)).not.toContain('| 2022 | 03 |');
    expect(text(result)).toContain('| 2022 | 02 | 2 | — | — | — | 0% |');
  });
  it('reports an empty comparison list when CDE sends no comparison entity', async () => {
    reply('/summarized/agency/CA0010400/robbery', {
      offenses: {
        actuals: { 'Agency Offenses': { '01-2022': 3 } },
        rates: { 'Agency Offenses': { '01-2022': 1.5 } },
      },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, comparisonInput);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toHaveProperty('comparisons', []);
    expect(text(result)).toContain('No comparison entities were returned');
  });
  it('fails a malformed comparison leaf as malformed upstream data', async () => {
    reply('/summarized/agency/CA0010400/robbery', {
      offenses: {
        actuals: { 'Agency Offenses': { '01-2022': 3 } },
        rates: { 'State Offenses': { '01-2022': '9' } },
      },
    });
    const result = await runToolContract(fbiGetCrimeEstimates, comparisonInput);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.SerializationError },
    });
    expect(text(result)).toContain('Malformed FBI');
  });
});
