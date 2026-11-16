/**
 * @fileoverview Tests for the shared CDE monthly rows: MM-YYYY parsing and chronological order,
 * the -1 rate, nulls and zeros, scoped-entity selection, unknown identifiers, and the month table.
 * @module tests/tools/cde-monthly.test
 */

import { readFileSync } from 'node:fs';
import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { describe, expect, it } from 'vitest';
import {
  identifierCheck,
  includeMonthlyField,
  monthlySeries,
} from '@/mcp-server/tools/cde-monthly.js';
import type { FbiMonthlyCounts } from '@/services/fbi-api/types.js';

type Series = Record<string, Record<string, number | null> | null>;

function capture<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'),
  ) as T;
}

/** A NIBRS counts payload with its `offenses` series lifted to the top level, as the service does. */
function liftedNibrs(name: string): FbiMonthlyCounts {
  const { offenses, ...rest } = capture<
    FbiMonthlyCounts & { offenses: { rates: Series; actuals: Series | null } }
  >(name);
  return { ...rest, rates: offenses.rates, actuals: offenses.actuals };
}

const arrests = monthlySeries({
  counts: { arrest_count: { series: 'Arrests', header: 'Arrests', description: 'Arrests.' } },
  rates: { rate_per_100k: { series: 'Arrests', header: 'Rate/100k', description: 'Rate.' } },
});

const hate = monthlySeries({
  counts: {
    incident_count: { series: 'Incidents', header: 'Incidents', description: 'Incidents.' },
    offense_count: { series: 'Offenses', header: 'Offenses', description: 'Offenses.' },
  },
  rates: {
    incident_rate_per_100k: { series: 'Incidents', header: 'Incident rate', description: 'Rate.' },
    offense_rate_per_100k: { series: 'Offenses', header: 'Offense rate', description: 'Rate.' },
  },
});

const nibrs = monthlySeries({
  counts: {
    actual_count: { series: 'Offenses', header: 'Offenses', description: 'Offenses.' },
    clearance_count: { series: 'Clearances', header: 'Clearances', description: 'Clearances.' },
  },
  rates: {
    rate_per_100k: { series: 'Offenses', header: 'Rate/100k', description: 'Rate.' },
    clearance_rate_per_100k: {
      series: 'Clearances',
      header: 'Clearance rate',
      description: 'Rate.',
    },
  },
});

/** A minimal arrest counts payload for one entity, months keyed as given. */
function arrestCounts(entity: string, months: Record<string, number | null>): FbiMonthlyCounts {
  return {
    actuals: { [`${entity} Arrests`]: months },
    rates: { [`${entity} Arrests`]: months },
  };
}

describe('monthlySeries rows: month keys and order', () => {
  it('parses MM-YYYY and sorts chronologically across year boundaries from CDE string order', () => {
    const rows = arrests.rows(
      arrestCounts('Ohio', {
        '01-1985': 1,
        '01-1986': 4,
        '02-1985': 2,
        '02-1986': 5,
        '12-1985': 3,
      }),
    );
    expect(rows?.map(({ year, month, arrest_count }) => [year, month, arrest_count])).toEqual([
      [1985, 1, 1],
      [1985, 2, 2],
      [1985, 12, 3],
      [1986, 1, 4],
      [1986, 2, 5],
    ]);
  });

  it('returns all 492 months of a 1985–2025 national window in order', () => {
    const payload = capture<FbiMonthlyCounts>('counts-arrest-national-all-1985-2025');
    expect(Object.keys(payload.actuals?.['United States Arrests'] ?? {}).slice(0, 3)).toEqual([
      '01-1985',
      '01-1986',
      '01-1987',
    ]);
    const rows = arrests.rows(payload) ?? [];
    expect(rows).toHaveLength(492);
    expect(rows[0]).toMatchObject({ year: 1985, month: 1 });
    expect(rows[491]).toMatchObject({ year: 2025, month: 12 });
    const ordinals = rows.map(({ year, month }) => year * 12 + month);
    expect(ordinals.every((value, i) => i === 0 || value === (ordinals[i - 1] ?? 0) + 1)).toBe(
      true,
    );
  });

  for (const key of ['2023-01', '00-2023', '13-2023', '1-2023', '01-23']) {
    it(`fails month key ${JSON.stringify(key)} as malformed upstream data`, () => {
      const call = () => arrests.rows(arrestCounts('Ohio', { [key]: 1 }));
      expect(call).toThrow(McpError);
      expect(call).toThrow(expect.objectContaining({ code: JsonRpcErrorCode.SerializationError }));
    });
  }
});

describe('monthlySeries rows: values', () => {
  it('reads -1 rates as null, keeps 0 as 0, and keeps months with a null participating population', () => {
    // San Antonio PD began NIBRS reporting 2020-11-01; CDE sends rate -1 and a null participating
    // population for most earlier months, but rate 0 with a population in August.
    const rows = nibrs.rows(liftedNibrs('counts-nibrs-agency-txspd0000-13a-2020')) ?? [];
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({
      year: 2020,
      month: 1,
      actual_count: 0,
      clearance_count: 0,
      rate_per_100k: null,
      clearance_rate_per_100k: null,
      population: 1573189,
      participated_population: null,
      population_coverage_percent: null,
    });
    expect(rows[7]).toMatchObject({
      month: 8,
      actual_count: 0,
      rate_per_100k: 0,
      clearance_rate_per_100k: 0,
      participated_population: 1573189,
    });
    expect(rows[10]).toMatchObject({
      month: 11,
      actual_count: 621,
      clearance_count: 132,
      rate_per_100k: 39.47,
      clearance_rate_per_100k: 8.39,
    });
    expect(rows.filter((row) => row.participated_population === null)).toHaveLength(9);
  });

  it('maps each count and rate series to its own field, with populations and coverage', () => {
    const rows = hate.rows(capture('counts-hate-national-all-2020-2022')) ?? [];
    expect(rows).toHaveLength(36);
    expect(rows[0]).toEqual({
      year: 2020,
      month: 1,
      incident_count: 598,
      offense_count: 684,
      incident_rate_per_100k: 0.19,
      offense_rate_per_100k: 0.21,
      population: 332726731,
      participated_population: 321657569,
      population_coverage_percent: 96.67,
    });
  });

  it("reads the scoped agency's series, never its state's or the nation's comparison rates", () => {
    // November 2020 rates: San Antonio PD 39.47, Texas 26.52, United States 19.84.
    const rows = nibrs.rows(liftedNibrs('counts-nibrs-agency-txspd0000-13a-2020')) ?? [];
    expect(rows[10]).toMatchObject({ month: 11, rate_per_100k: 39.47, population: 1573189 });
  });

  it('a recognized entity with every month null keeps its rows, all null', () => {
    const rows = arrests.rows(capture('counts-arrest-agency-tx0950000-all-2023'));
    expect(rows).toHaveLength(12);
    for (const row of rows ?? []) {
      expect(row).toMatchObject({
        arrest_count: null,
        rate_per_100k: null,
        population: 7149,
        participated_population: null,
        population_coverage_percent: null,
      });
    }
  });

  it('returns null when CDE sends null actuals for an identifier it does not recognize', () => {
    expect(arrests.rows(capture('counts-arrest-agency-unknown-all-2023'))).toBeNull();
    expect(hate.rows(capture('counts-hate-agency-unknown-all-2023'))).toBeNull();
    expect(arrests.rows({ actuals: {}, rates: null })).toBeNull();
  });

  it('a sparse month relays null for every series and population CDE omitted', () => {
    const rows = arrests.rows({ actuals: { 'Ohio Arrests': { '03-2023': 7 } } });
    expect(rows).toEqual([
      {
        year: 2023,
        month: 3,
        arrest_count: 7,
        rate_per_100k: null,
        population: null,
        participated_population: null,
        population_coverage_percent: null,
      },
    ]);
  });
});

describe('monthlySeries table', () => {
  it('renders every column in en-US, — for null, coverage as a percentage', () => {
    const lines = nibrs.table([
      {
        year: 2020,
        month: 1,
        actual_count: 0,
        clearance_count: 0,
        rate_per_100k: null,
        clearance_rate_per_100k: null,
        population: 1573189,
        participated_population: null,
        population_coverage_percent: null,
      },
      {
        year: 2023,
        month: 11,
        actual_count: 13295,
        clearance_count: 3053,
        rate_per_100k: 0.13,
        clearance_rate_per_100k: 185.83,
        population: 338357687,
        participated_population: 323468088,
        population_coverage_percent: 95.89,
      },
    ]);
    expect(lines[0]).toBe('');
    expect(lines[1]).toMatch(/^Monthly counts: rates are per 100,000 participating population/);
    expect(lines[1]).toContain('not reported zeros');
    expect(lines.slice(2, 4)).toEqual(['', '### Monthly counts']);
    expect(lines.slice(4)).toEqual([
      '| Year | Month | Offenses | Clearances | Rate/100k | Clearance rate | Population | Participating population | Population coverage |',
      '|:-----|:-----:|---:|---:|---:|---:|---:|---:|---:|',
      '| 2020 | 01 | 0 | 0 | — | — | 1,573,189 | — | — |',
      '| 2023 | 11 | 13,295 | 3,053 | 0.13 | 185.83 | 338,357,687 | 323,468,088 | 95.89% |',
    ]);
  });

  it('says so for an empty monthly list instead of emitting a header-only table', () => {
    expect(arrests.table([])).toEqual([
      '',
      '### Monthly counts',
      'CDE sent no monthly series for this state or ORI.',
    ]);
  });
});

describe('monthly fields and identifier check', () => {
  it('include_monthly defaults to false and the monthly field is optional', () => {
    expect(includeMonthlyField.parse(undefined)).toBe(false);
    expect(arrests.field.safeParse(undefined).success).toBe(true);
    expect(arrests.field.description).toContain('Present only when include_monthly is true');
    expect(arrests.field.safeParse([{ year: 2023, month: 1, arrest_count: '5' }]).success).toBe(
      false,
    );
  });

  it('describes counts as not reported zeros without participation, and rates as -1 → null', () => {
    const shape = arrests.field.unwrap().element.shape;
    expect(shape.arrest_count.description).toContain('not a reported zero');
    expect(shape.rate_per_100k.description).toContain('-1');
    expect(shape.population_coverage_percent.description).toContain('never calculated');
  });

  it('maps monthly rows to recognized, null to unrecognized, and no request to unchecked', () => {
    expect(identifierCheck(undefined)).toBe('unchecked');
    expect(identifierCheck(null)).toBe('unrecognized');
    expect(identifierCheck([])).toBe('recognized');
  });

  it('maps rows that all lack a participated_population to unreported, any reported month to recognized', () => {
    const unreported = { participated_population: null };
    expect(identifierCheck([unreported, unreported])).toBe('unreported');
    expect(identifierCheck([unreported, { participated_population: 7149 }])).toBe('recognized');
  });
});
