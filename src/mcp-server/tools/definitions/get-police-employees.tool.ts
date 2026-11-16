/**
 * @fileoverview FBI CDE law enforcement employees tool: sworn officers and civilians by sex,
 * employees per 1,000 people, participated population, and population coverage, one row per year,
 * at national, state, or agency scope.
 * @module mcp-server/tools/definitions/get-police-employees.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { resolveScopedYears, scopeFields } from '@/mcp-server/tools/cde-scoped-range.js';
import {
  formatNumber,
  formatPercent,
  scopeEchoFields,
  scopeHeading,
  scopeLabel,
  scopeLine,
} from '@/mcp-server/tools/cde-totals.js';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';
import type { CdeYearWindow, FbiPoliceEmployees } from '@/services/fbi-api/types.js';

/** First year /pe serves; CDE refuses an earlier `from` with HTTP 400. */
const FLOOR_YEAR = 1985;

const EmployeeYearSchema = z.object({
  year: z.number().describe('Data year.'),
  male_officers: z
    .number()
    .nullable()
    .describe('Male sworn officers (CDE "Male Officers"); null when CDE sent no value.'),
  female_officers: z
    .number()
    .nullable()
    .describe('Female sworn officers (CDE "Female Officers"); null when CDE sent no value.'),
  male_civilians: z
    .number()
    .nullable()
    .describe('Male civilian employees (CDE "Male Civilians"); null when CDE sent no value.'),
  female_civilians: z
    .number()
    .nullable()
    .describe('Female civilian employees (CDE "Female Civilians"); null when CDE sent no value.'),
  employees_per_1000: z
    .number()
    .nullable()
    .describe(
      'Law enforcement employees per 1,000 people as CDE publishes it, never recomputed; it can differ slightly from the four counts over participated_population. Null when CDE sent no value.',
    ),
  participated_population: z
    .number()
    .nullable()
    .describe(
      'Population of the reporting agencies (CDE "Participated Population"); null when CDE sent no value.',
    ),
  population_coverage_percent: z
    .number()
    .nullable()
    .describe(
      'Percent of population coverage as CDE supplies it for state and national scope; always null at agency scope, where CDE sends none.',
    ),
});

type EmployeeYear = z.infer<typeof EmployeeYearSchema>;

/** Every per-year value, in the order rows and table columns carry them, with its column label. */
const COLUMNS = [
  ['male_officers', 'Male officers'],
  ['female_officers', 'Female officers'],
  ['male_civilians', 'Male civilians'],
  ['female_civilians', 'Female civilians'],
  ['employees_per_1000', 'Employees per 1,000'],
  ['participated_population', 'Participated population'],
  ['population_coverage_percent', 'Population coverage'],
] as const satisfies readonly (readonly [Exclude<keyof EmployeeYear, 'year'>, string])[];

/** One row per year any series carries, ascending; a value a series lacks is null. */
function toRows(data: FbiPoliceEmployees): EmployeeYear[] {
  const coverage = data.tooltips?.['Percent of Population Coverage'];
  const series = {
    male_officers: data.actuals?.['Male Officers'],
    female_officers: data.actuals?.['Female Officers'],
    male_civilians: data.actuals?.['Male Civilians'],
    female_civilians: data.actuals?.['Female Civilians'],
    employees_per_1000: data.rates?.['Law Enforcement Employees per 1,000 People'],
    participated_population: data.populations?.['Participated Population'],
    // Keyed by the one entity a state or national response names.
    population_coverage_percent: coverage ? Object.values(coverage)[0] : undefined,
  };
  // Year keys are validated as four digits, so string order is year order.
  const years = [...new Set(Object.values(series).flatMap((s) => Object.keys(s ?? {})))].sort();
  return years.map((year) => ({
    year: Number(year),
    male_officers: series.male_officers?.[year] ?? null,
    female_officers: series.female_officers?.[year] ?? null,
    male_civilians: series.male_civilians?.[year] ?? null,
    female_civilians: series.female_civilians?.[year] ?? null,
    employees_per_1000: series.employees_per_1000?.[year] ?? null,
    participated_population: series.participated_population?.[year] ?? null,
    population_coverage_percent: series.population_coverage_percent?.[year] ?? null,
  }));
}

/**
 * Recovery for an all-null payload. CDE sends all nulls both for an unrecognized identifier and
 * for years with no published counts, so the hint checks the identifier first.
 */
function noDataHint(window: CdeYearWindow): string {
  if (window.scope === 'agency')
    return 'Confirm the ORI with fbi_search_agencies. CDE returns no values both for an ORI it does not recognize and for years with no published employee counts; the current year has none until CDE publishes it.';
  if (window.scope === 'state')
    return 'Confirm state_abbr is a US state or territory abbreviation. CDE returns no values both for a code it does not recognize and for years with no published employee counts; the current year has none until CDE publishes it.';
  return 'CDE has no published employee counts for these years; the current year has none until CDE publishes it. Request earlier years.';
}

export const fbiGetPoliceEmployees = tool('fbi_get_police_employees', {
  title: 'FBI Get Police Employees',
  description: `Law enforcement staffing reported to FBI CDE for the nation, a state, or an agency, one row per year from ${FLOOR_YEAR} through the current year: male and female sworn officers, male and female civilian employees, law enforcement employees per 1,000 people, the participated population, and the percent of population coverage (state and national scope only). The per-1,000 rate is CDE's published figure, passed through as sent; it can differ slightly from the four counts over the participated population. CDE sends no totals; add the four counts for all employees. National scope omits identifiers; state requires only state_abbr; agency requires only ori (look it up with fbi_search_agencies). A year CDE has not published, including the current year until it does, returns a row of nulls; when no requested year has any value, as for an unrecognized state or ORI, the call fails with no_data.`,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'scope_param_missing',
      code: JsonRpcErrorCode.ValidationError,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr for state scope, or ori (9-character ORI code) for agency scope.',
      thrownBy: 'service',
    },
    {
      reason: 'scope_param_incompatible',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Identifiers are supplied for a scope that does not apply them.',
      recovery:
        'For national scope omit state_abbr and ori; for state provide only state_abbr; for agency provide only ori.',
      thrownBy: 'service',
    },
    {
      reason: 'year_out_of_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'from_year or to_year is after the current UTC year.',
      recovery: `Use from_year and to_year from ${FLOOR_YEAR} through the current year.`,
      thrownBy: 'service',
    },
    {
      reason: 'invalid_date_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'from_year is later than to_year.',
      recovery: 'Correct from_year and to_year so the start year is no later than the end year.',
      thrownBy: 'service',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'CDE returned no value for any requested year: an unrecognized state or ORI, or years with no published employee counts.',
      recovery:
        'Confirm the identifier first (the ORI with fbi_search_agencies, or state_abbr), then request earlier years; the current year has none until CDE publishes it.',
    },
  ],

  input: z.object({
    ...scopeFields(),
    from_year: z
      .number()
      .int()
      .min(FLOOR_YEAR)
      .describe(`First year (inclusive), ${FLOOR_YEAR} through the current year.`),
    to_year: z
      .number()
      .int()
      .min(FLOOR_YEAR)
      .describe(`Last year (inclusive), ${FLOOR_YEAR} through the current year.`),
  }),

  output: z.object({
    scope: scopeEchoFields.scope,
    state_abbr: scopeEchoFields.state_abbr,
    ori: scopeEchoFields.ori,
    from_year: z.number().describe('First year requested.'),
    to_year: z.number().describe('Last year requested.'),
    years: z
      .array(EmployeeYearSchema.describe('Staffing values CDE published for one year.'))
      .describe(
        'One row per year CDE returned, ascending. A year CDE has not published keeps its row with every value null.',
      ),
    data_last_updated: z
      .string()
      .optional()
      .describe('Date CDE last refreshed UCR data; absent when CDE omits it.'),
    max_data_date: z
      .string()
      .optional()
      .describe(
        "CDE's latest UCR data month (MM/YYYY), not the latest staffing year; absent when CDE omits it.",
      ),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_police_employees', {
      scope: input.scope,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });
    const window = resolveScopedYears(input, FLOOR_YEAR, ctx);
    const data = await getFbiApiService().getPoliceEmployees(window, ctx);
    const years = toRows(data);
    if (years.every((row) => COLUMNS.every(([field]) => row[field] === null))) {
      throw ctx.fail(
        'no_data',
        `CDE returned no police employee values for ${scopeLabel(window)}, ${window.fromYear}–${window.toYear}.`,
        { recovery: { hint: noDataHint(window) } },
      );
    }
    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;
    const maxDataDate = data.cde_properties?.max_data_date?.UCR;
    return {
      scope: window.scope,
      ...(window.scope === 'state' && { state_abbr: window.stateAbbr }),
      ...(window.scope === 'agency' && { ori: window.ori }),
      from_year: window.fromYear,
      to_year: window.toYear,
      years,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
      ...(maxDataDate && { max_data_date: maxDataDate }),
    };
  },

  format: (result) => {
    const cell = (field: (typeof COLUMNS)[number][0], value: number | null) =>
      field === 'population_coverage_percent' ? formatPercent(value) : formatNumber(value);
    const lines = [
      `## FBI Police Employees — ${scopeHeading(result)}`,
      scopeLine(result),
      `**Years:** ${result.from_year} → ${result.to_year}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    if (result.max_data_date)
      lines.push(
        `**Max data date:** ${result.max_data_date} (CDE's latest UCR data month, not the latest staffing year)`,
      );
    lines.push(
      '',
      "— means CDE sent no value. Employees per 1,000 is CDE's published rate; CDE supplies population coverage for state and national scope only.",
      `| Year | ${COLUMNS.map(([, label]) => label).join(' | ')} |`,
      `|:-----|${COLUMNS.map(() => '---:|').join('')}`,
      ...result.years.map(
        (row) =>
          `| ${row.year} | ${COLUMNS.map(([field]) => cell(field, row[field])).join(' | ')} |`,
      ),
    );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
