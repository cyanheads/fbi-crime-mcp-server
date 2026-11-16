/**
 * @fileoverview Tests for fbi_get_crime_estimates tool.
 * @module tests/tools/get-crime-estimates.tool.test
 */

import { readFileSync } from 'node:fs';
import { z } from '@cyanheads/mcp-ts-core';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';
import { FbiSummarizedResponseSchema } from '@/services/fbi-api/types.js';

const mockGetSummarizedNational = vi.fn();
const mockGetSummarizedState = vi.fn();
const mockGetSummarizedAgency = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getSummarizedNational: mockGetSummarizedNational,
    getSummarizedState: mockGetSummarizedState,
    getSummarizedAgency: mockGetSummarizedAgency,
  }),
}));

/** The text blocks of a tool result, joined as one rendering. */
function rendered(result: Awaited<ReturnType<typeof runToolContract>>): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** FbiSummarizedResponse with monthly data for violent-crime national. */
const mockNationalResponse = {
  cde_properties: {
    last_refresh_date: { UCR: '2024-01-15' },
    max_data_date: { UCR: '2023-12-31' },
  },
  offenses: {
    rates: {
      'United States Offenses': { '01-2022': 387.5, '02-2022': 392.1 },
      'United States Clearances': { '01-2022': 95.2, '02-2022': 98.0 },
    },
    actuals: {
      'United States Offenses': { '01-2022': 102500, '02-2022': 103200 },
      'United States Clearances': { '01-2022': 28000, '02-2022': 29100 },
    },
  },
};

/** FbiSummarizedResponse with state-level data. */
const mockStateResponse = {
  offenses: {
    rates: {
      'California Offenses': { '01-2022': 420.0 },
      'California Clearances': { '01-2022': 100.0 },
    },
    actuals: {
      'California Offenses': { '01-2022': 17500 },
      'California Clearances': { '01-2022': 4200 },
    },
  },
};

/**
 * Agency-scope response in the key order the live CDE returns: `rates` lists the
 * agency's state and the nation ahead of the agency itself; `actuals` holds only
 * the agency.
 */
const mockAgencyResponse = {
  offenses: {
    rates: {
      'California Offenses': { '01-2022': 10.89 },
      'California Clearances': { '01-2022': 2.7 },
      'United States Offenses': { '01-2022': 5.58 },
      'United States Clearances': { '01-2022': 1.28 },
      'Emeryville Police Department Offenses': { '01-2022': 70.31 },
      'Emeryville Police Department Clearances': { '01-2022': 15.62 },
    },
    actuals: {
      'Emeryville Police Department Offenses': { '01-2022': 9 },
      'Emeryville Police Department Clearances': { '01-2022': 2 },
    },
  },
};

/** State-scope response in live CDE key order: the state ahead of the nation in `rates`. */
const mockStateWithNationResponse = {
  offenses: {
    rates: {
      'California Offenses': { '01-2022': 10.89 },
      'California Clearances': { '01-2022': 2.7 },
      'United States Offenses': { '01-2022': 5.58 },
      'United States Clearances': { '01-2022': 1.28 },
    },
    actuals: {
      'California Offenses': { '01-2022': 4208 },
      'California Clearances': { '01-2022': 1042 },
    },
  },
};

describe('fbiGetCrimeEstimates', () => {
  beforeEach(() => {
    mockGetSummarizedNational.mockReset();
    mockGetSummarizedState.mockReset();
    mockGetSummarizedAgency.mockReset();
  });

  it('returns national monthly estimates', async () => {
    mockGetSummarizedNational.mockResolvedValue(mockNationalResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'violent-crime',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 2,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.offense).toBe('violent-crime');
    expect(result.months).toHaveLength(2);
    expect(result.total_months).toBe(2);
    expect(result.data_last_updated).toBe('2024-01-15');
    const jan = result.months.find((m) => m.month === 1 && m.year === 2022);
    expect(jan?.rate_per_100k).toBe(387.5);
    expect(jan?.actual_count).toBe(102500);
  });

  it.each([true, false])(
    'returns all 504 captured months in one call on both surfaces, include_comparisons=%s',
    async (include_comparisons) => {
      mockGetSummarizedAgency.mockResolvedValue(
        FbiSummarizedResponseSchema.parse(
          JSON.parse(
            readFileSync(
              new URL('../fixtures/cde/agency-ca0194200-property-1985-2026.json', import.meta.url),
              'utf8',
            ),
          ),
        ),
      );
      const result = await runToolContract(fbiGetCrimeEstimates, {
        scope: 'agency',
        ori: 'CA0194200',
        offense: 'property-crime',
        from_year: 1985,
        to_year: 2026,
        include_comparisons,
      });
      expect(result.isError).not.toBe(true);
      expect(mockGetSummarizedAgency).toHaveBeenCalledTimes(1);
      expect(result.structuredContent).not.toHaveProperty('next_from');
      expect(result.structuredContent).not.toHaveProperty('oversize_notice');
      const output = fbiGetCrimeEstimates.output.parse(result.structuredContent);
      expect(output.total_months).toBe(504);
      expect(output.months).toHaveLength(504);
      expect(output.months[0]).toMatchObject({
        year: 1985,
        month: 1,
        rate_per_100k: 639.39,
        actual_count: 20374,
        population: 3186459,
      });
      expect(output.months.at(-1)).toMatchObject({
        year: 2026,
        month: 12,
        rate_per_100k: null,
        actual_count: null,
      });
      const text = rendered(result);
      expect(text).toContain('**Months returned:** 504');
      expect(text).toContain('| 1985 | 01 | 639.39 |');
      expect(text).toContain('| 2026 | 12 | — |');
      expect(text).not.toMatch(/next_from|oversize|24,000/);
      const rows = text.split('\n').filter((line) => /^\| \d{4} \| \d{2} \|/.test(line));
      if (!include_comparisons) {
        expect(result.structuredContent).not.toHaveProperty('comparisons');
        expect(rows).toHaveLength(504);
        return;
      }
      expect(output.comparisons?.map((comparison) => comparison.entity_name)).toEqual([
        'California',
        'United States',
      ]);
      const scopedMonths = output.months.map(({ year, month }) => ({ year, month }));
      for (const comparison of output.comparisons ?? []) {
        expect(comparison.months.map(({ year, month }) => ({ year, month }))).toEqual(scopedMonths);
      }
      expect(text).toContain('### Comparison: California');
      expect(text).toContain('### Comparison: United States');
      expect(rows).toHaveLength(504 * 3);
    },
  );

  it('advertises no continuation field or byte budget', () => {
    const properties = Object.keys(z.toJSONSchema(fbiGetCrimeEstimates.output).properties ?? {});
    expect(properties).toContain('months');
    expect(properties).not.toContain('next_from');
    expect(properties).not.toContain('oversize_notice');
    expect(fbiGetCrimeEstimates.description).not.toMatch(/24,000|next_from|oversize_notice/);
  });

  it('renders numbers in en-US whatever the host default locale', async () => {
    mockGetSummarizedState.mockResolvedValue({
      offenses: {
        rates: {
          'California Offenses': { '01-2022': 2.72 },
          'California Clearances': { '01-2022': 0.5 },
        },
        actuals: {
          'California Offenses': { '01-2022': 1233 },
          'California Clearances': { '01-2022': 1042 },
        },
      },
      populations: {
        population: { California: { '01-2022': 39029342 } },
        participated_population: { California: { '01-2022': 38642850 } },
      },
      tooltips: { 'Percent of Population Coverage': { California: { '01-2022': 99.01 } } },
    });
    // Node takes its default locale from LANG; simulate a de-DE host (Bun always resolves en-US).
    const HostNumberFormat = Intl.NumberFormat;
    const hostToLocaleString = Number.prototype.toLocaleString;
    const numberFormat = vi.spyOn(Intl, 'NumberFormat').mockImplementation(
      class extends HostNumberFormat {
        constructor(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
          super(locales ?? 'de-DE', options);
        }
      },
    );
    const numberToLocaleString = vi
      .spyOn(Number.prototype, 'toLocaleString')
      .mockImplementation(function (this: number, locales, options) {
        return hostToLocaleString.call(this, locales ?? 'de-DE', options);
      });
    let result: Awaited<ReturnType<typeof runToolContract>>;
    try {
      expect((1233).toLocaleString()).toBe('1.233');
      expect(new Intl.NumberFormat().format(39029342)).toBe('39.029.342');
      // The shared population and coverage cells use a formatter built at import, so import the
      // tool afresh on the simulated host.
      vi.resetModules();
      const { fbiGetCrimeEstimates: onHost } = await import(
        '@/mcp-server/tools/definitions/get-crime-estimates.tool.js'
      );
      result = await runToolContract(onHost, {
        scope: 'state',
        state_abbr: 'CA',
        offense: 'robbery',
        from_year: 2022,
        to_year: 2022,
        to_month: 1,
      });
    } finally {
      numberFormat.mockRestore();
      numberToLocaleString.mockRestore();
    }
    expect(result.structuredContent).toMatchObject({
      months: [{ rate_per_100k: 2.72, actual_count: 1233, population: 39029342 }],
    });
    expect(rendered(result)).toContain(
      '| 2022 | 01 | 2.72 | 0.5 | 1,233 | 1,042 | 39,029,342 | 38,642,850 | 99.01% |',
    );
  });

  it('returns state estimates', async () => {
    mockGetSummarizedState.mockResolvedValue(mockStateResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 1,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.months).toHaveLength(1);
    expect(result.months[0]?.rate_per_100k).toBe(420.0);
  });

  it("agency scope reports the agency's own rates, not its state's", async () => {
    mockGetSummarizedAgency.mockResolvedValue(mockAgencyResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'agency',
      offense: 'robbery',
      ori: 'CA0010400',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 1,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.months).toEqual([
      {
        year: 2022,
        month: 1,
        rate_per_100k: 70.31,
        clearance_rate_per_100k: 15.62,
        actual_count: 9,
        clearance_count: 2,
        population: null,
        participated_population: null,
        population_coverage_percent: null,
      },
    ]);
  });

  it('state scope reports the state rates when the nation is listed alongside', async () => {
    mockGetSummarizedState.mockResolvedValue(mockStateWithNationResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'state',
      offense: 'robbery',
      state_abbr: 'CA',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 1,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.months).toEqual([
      {
        year: 2022,
        month: 1,
        rate_per_100k: 10.89,
        clearance_rate_per_100k: 2.7,
        actual_count: 4208,
        clearance_count: 1042,
        population: null,
        participated_population: null,
        population_coverage_percent: null,
      },
    ]);
  });

  it('throws scope_param_missing when state scope lacks state_abbr', async () => {
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'state',
      offense: 'robbery',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws scope_param_missing when agency scope lacks ori', async () => {
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'agency',
      offense: 'burglary',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws no_data when summarized endpoint returns empty rate/actual maps', async () => {
    mockGetSummarizedNational.mockResolvedValue({
      offenses: { rates: {}, actuals: {} },
    });
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'homicide',
      from_year: 2024,
      to_year: 2024,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats output with scope, offense, and monthly table', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from: '01-2022',
      entity_name: 'California',
      to: '01-2022',
      months: [
        {
          year: 2022,
          month: 1,
          rate_per_100k: 420.0,
          clearance_rate_per_100k: 100.0,
          actual_count: 17500,
          clearance_count: 4200,
          population: null,
          participated_population: null,
          population_coverage_percent: null,
        },
      ],
      total_months: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**Scope:** state');
    expect(text).toContain('**State:** CA');
    expect(text).toContain('violent-crime');
    expect(text).toContain('420');
    expect(text).toContain('17,500');
  });

  it('formats sparse monthly row with dashes for missing values', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'national',
      offense: 'robbery',
      from: '01-2022',
      entity_name: 'United States',
      to: '01-2022',
      months: [
        {
          year: 2022,
          month: 1,
          population: null,
          participated_population: null,
          population_coverage_percent: null,
        },
      ],
      total_months: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2022');
    expect(text).toContain('—');
  });

  it('describes rates against the participating population', () => {
    const { shape } = fbiGetCrimeEstimates.output;
    const month = shape.months.element.shape;
    const comparison = shape.comparisons.unwrap().element.shape.months.element.shape;
    for (const field of [
      month.rate_per_100k,
      month.clearance_rate_per_100k,
      comparison.rate_per_100k,
      comparison.clearance_rate_per_100k,
    ])
      expect(field.description).toContain('per 100,000 participating population');
    expect(fbiGetCrimeEstimates.description).toContain('per 100,000 participating population');
    expect(fbiGetCrimeEstimates.description).not.toMatch(/per 100k population/);
  });

  it('advertises the 1985 floor without a fixed ceiling', () => {
    const properties = z.toJSONSchema(fbiGetCrimeEstimates.input).properties ?? {};
    for (const field of ['from_year', 'to_year']) {
      const year = properties[field] as { minimum?: number; maximum?: number };
      expect(year.minimum).toBe(1985);
      // Only the integer type's own bound remains; the ceiling is checked per call.
      expect(year.maximum ?? Number.POSITIVE_INFINITY).toBeGreaterThan(9999);
    }
    expect(properties.include_comparisons).toMatchObject({ type: 'boolean', default: false });
  });

  it('months are sorted chronologically', async () => {
    mockGetSummarizedNational.mockResolvedValue({
      offenses: {
        rates: {
          'United States Offenses': {
            '03-2022': 400.0,
            '01-2022': 380.0,
            '02-2022': 390.0,
          },
        },
        actuals: { 'United States Offenses': { '01-2022': 100, '02-2022': 101, '03-2022': 102 } },
      },
    });
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'robbery',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 3,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.months[0]?.month).toBe(1);
    expect(result.months[1]?.month).toBe(2);
    expect(result.months[2]?.month).toBe(3);
  });
});
