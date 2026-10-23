/**
 * @fileoverview FBI CDE summarized offense data tool.
 * Returns monthly offense rates and counts from the /cde/summarized/ endpoint.
 * Replaces the decommissioned UCR /estimates/ endpoint.
 * @module mcp-server/tools/definitions/get-crime-estimates.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { resolveScopedRange, scopedRangeFields } from '@/mcp-server/tools/cde-scoped-range.js';
import { escapeMarkdown, scopeHeading, scopeLine } from '@/mcp-server/tools/cde-totals.js';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

/** First year the /summarized/ endpoint serves, at every scope. */
const FLOOR_YEAR = 1985;

const { scope: scopeField, ...rangeFields } = scopedRangeFields(FLOOR_YEAR);

/** Valid offense slugs accepted by the /summarized/ endpoint. */
const OFFENSE_VALUES = [
  'violent-crime',
  'property-crime',
  'robbery',
  'burglary',
  'larceny',
  'motor-vehicle-theft',
  'arson',
  'aggravated-assault',
  'rape',
  'homicide',
] as const;

/** Parse a MM-YYYY key into { year, month } numbers. */
function parseApiDate(key: string): { year: number; month: number } {
  const parts = key.split('-');
  return { month: parseInt(parts[0] ?? '1', 10), year: parseInt(parts[1] ?? '2000', 10) };
}

/** The entity a `rates` key names, or undefined for a key that is neither offenses nor clearances. */
function rateEntity(key: string): string | undefined {
  if (key.endsWith(' Offenses')) return key.slice(0, -' Offenses'.length);
  if (key.endsWith(' Clearances')) return key.slice(0, -' Clearances'.length);
  return;
}

const ComparisonMonthSchema = z
  .object({
    year: z.number().describe('Year.'),
    month: z.number().describe('Month (1–12).'),
    rate_per_100k: z
      .number()
      .nullable()
      .describe(
        'Comparison entity offense rate per 100,000 participating population; null when unavailable.',
      ),
    clearance_rate_per_100k: z
      .number()
      .nullable()
      .describe(
        'Comparison entity clearance rate per 100,000 participating population; null when unavailable.',
      ),
    population: z
      .number()
      .nullable()
      .describe('Provider population for the comparison entity and month; null when unavailable.'),
    participated_population: z
      .number()
      .nullable()
      .describe(
        'Provider participating population for the comparison entity and month; null when unavailable.',
      ),
    population_coverage_percent: z
      .number()
      .nullable()
      .describe(
        'Provider reporting coverage percentage for the comparison entity and month; never calculated, null when unavailable.',
      ),
  })
  .describe('One month of comparison rates, matching a scoped month.');

export const fbiGetCrimeEstimates = tool('fbi_get_crime_estimates', {
  title: 'FBI Get Crime Estimates',
  description: `Monthly offense rates (per 100,000 participating population), raw counts, population denominators and provider reporting coverage from FBI CDE, January ${FLOOR_YEAR} through the current year; current-year months past the latest data return null values. National scope omits identifiers; state requires only state_abbr; agency requires only ori. Identifiers are case-insensitive; start must be no later than end. Set include_comparisons on state or agency scope to also get the comparison rates CDE sends for the same months (an agency's state and the United States, or a state's United States). Missing coverage stays null and participation may be incomplete. Offenses: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, homicide.`,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'invalid_date_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The complete starting year/month is later than the ending year/month.',
      recovery:
        'Correct from_year/from_month and to_year/to_month so the start is no later than the end.',
      thrownBy: 'service',
    },
    {
      reason: 'scope_param_incompatible',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Identifiers are supplied for a scope that does not apply them, or include_comparisons is true for national scope.',
      recovery:
        'For national scope omit state_abbr, ori and include_comparisons; for state provide only state_abbr; for agency provide only ori.',
    },
    {
      reason: 'scope_param_missing',
      code: JsonRpcErrorCode.ValidationError,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr for state scope, or ori (9-character ORI code) for agency scope.',
      thrownBy: 'service',
    },
    {
      reason: 'year_out_of_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'from_year or to_year is after the current UTC year.',
      recovery: `Use from_year and to_year from ${FLOOR_YEAR} through the current year; current-year months past the latest data return null values.`,
      thrownBy: 'service',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No data was returned for the requested offense and date range.',
      recovery:
        'Verify state_abbr, or look up the ori with fbi_search_agencies, for the selected scope first; then check offense and date availability or broaden the date range.',
    },
  ],

  input: z.object({
    scope: scopeField,
    offense: z
      .enum(OFFENSE_VALUES)
      .describe(
        'Offense type: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, or homicide.',
      ),
    ...rangeFields,
    include_comparisons: z
      .boolean()
      .default(false)
      .describe(
        "Also return the comparison entities CDE sends with state or agency data (an agency's state and the United States, or a state's United States) as monthly rates, populations and coverage for the scoped months. Must be false or omitted for national scope.",
      ),
  }),

  output: z.object({
    scope: z.string().describe('Geographic scope.'),
    offense: z.string().describe('Offense type queried.'),
    entity_name: z.string().describe('Provider entity selected from scoped offense actuals.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is "state".'),
    ori: z.string().optional().describe('ORI code when scope is "agency".'),
    from: z.string().describe('Start of data range (MM-YYYY).'),
    to: z.string().describe('End of data range (MM-YYYY).'),
    months: z
      .array(
        z
          .object({
            year: z.number().describe('Year.'),
            month: z.number().describe('Month (1–12).'),
            rate_per_100k: z
              .number()
              .nullable()
              .optional()
              .describe('Offense rate per 100,000 participating population.'),
            clearance_rate_per_100k: z
              .number()
              .nullable()
              .optional()
              .describe('Clearance rate per 100,000 participating population.'),
            actual_count: z.number().nullable().optional().describe('Raw offense count.'),
            clearance_count: z.number().nullable().optional().describe('Raw clearance count.'),
            population: z
              .number()
              .nullable()
              .describe('Provider population for this entity and month; null when unavailable.'),
            participated_population: z
              .number()
              .nullable()
              .describe(
                'Provider participating population for this entity and month; null when unavailable.',
              ),
            population_coverage_percent: z
              .number()
              .nullable()
              .describe(
                'Provider reporting coverage percentage for this entity and month; never calculated or borrowed, null when unavailable.',
              ),
          })
          .describe('One month of offense data.'),
      )
      .describe('Monthly data rows sorted chronologically.'),
    total_months: z.number().describe('Number of months returned.'),
    data_last_updated: z.string().optional().describe('Date the CDE last refreshed this data.'),
    max_data_date: z
      .string()
      .optional()
      .describe('Latest data date reported by CDE, in the provider format.'),
    comparisons: z
      .array(
        z
          .object({
            entity_name: z.string().describe('Comparison entity name as CDE labels it.'),
            months: z
              .array(ComparisonMonthSchema)
              .describe('One row per scoped month, in the same order as months.'),
          })
          .describe('Rates, populations and coverage CDE sent for one comparison entity.'),
      )
      .optional()
      .describe(
        "Present only when include_comparisons is true: the comparison entities in CDE's order (an agency's state, then the United States; a state's United States). Empty when CDE sent none. CDE sends no counts for comparison entities.",
      ),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_crime_estimates', {
      scope: input.scope,
      offense: input.offense,
      state_abbr: input.state_abbr,
      ori: input.ori,
      include_comparisons: input.include_comparisons,
    });

    if (input.scope === 'national' && input.include_comparisons) {
      throw ctx.fail(
        'scope_param_incompatible',
        'include_comparisons is not applicable to scope="national"; national data has no comparison entity.',
      );
    }
    const range = resolveScopedRange(input, FLOOR_YEAR, ctx);
    const { from, to } = range;
    const svc = getFbiApiService();
    const data =
      range.scope === 'national'
        ? await svc.getSummarizedNational(input.offense, { from, to }, ctx)
        : range.scope === 'state'
          ? await svc.getSummarizedState(range.stateAbbr, input.offense, { from, to }, ctx)
          : await svc.getSummarizedAgency(range.ori, input.offense, { from, to }, ctx);

    // Keys are "{Entity} Offenses" / "{Entity} Clearances". `actuals` carries only the
    // scoped entity (the nation, the state, or the agency), while `rates` also lists an
    // agency's state and the nation — so the entity named in `actuals` selects the rates.
    const offenseRates = data.offenses?.rates;
    const offenseActuals = data.offenses?.actuals;

    const entity = Object.keys(offenseActuals ?? {})
      .find((k) => k.endsWith(' Offenses'))
      ?.slice(0, -' Offenses'.length);
    const series = (
      map: Record<string, Record<string, number | null> | null> | null | undefined,
      kind: 'Offenses' | 'Clearances',
    ): Record<string, number | null> =>
      (entity === undefined ? undefined : map?.[`${entity} ${kind}`]) ?? {};

    const rateData = series(offenseRates, 'Offenses');
    const clearanceRateData = series(offenseRates, 'Clearances');
    const actualData = series(offenseActuals, 'Offenses');
    const clearanceActualData = series(offenseActuals, 'Clearances');

    // Collect all month keys and build sorted rows
    const allKeys = new Set([...Object.keys(rateData), ...Object.keys(actualData)]);

    if (entity === undefined || Object.keys(actualData).length === 0) {
      throw ctx.fail(
        'no_data',
        `No data returned for offense="${input.offense}" scope="${input.scope}" from=${from} to=${to}.`,
      );
    }

    // Denominators and coverage for any entity CDE labels, keyed by month.
    const denominators = (name: string) => ({
      population: data.populations?.population?.[name],
      participated: data.populations?.participated_population?.[name],
      coverage: data.tooltips?.['Percent of Population Coverage']?.[name],
    });
    const own = denominators(entity);

    const monthKeys = Array.from(allKeys)
      .map((key) => ({ key, ...parseApiDate(key) }))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
    const months = monthKeys.map(({ key, year, month }) => ({
      year,
      month,
      rate_per_100k: rateData[key] ?? null,
      clearance_rate_per_100k: clearanceRateData[key] ?? null,
      actual_count: actualData[key] ?? null,
      clearance_count: clearanceActualData[key] ?? null,
      population: own.population?.[key] ?? null,
      participated_population: own.participated?.[key] ?? null,
      population_coverage_percent: own.coverage?.[key] ?? null,
    }));

    // Comparison entities are the other entities `rates` names, in CDE's key order. Their rows
    // cover exactly the scoped months, so a comparison-only month never appears.
    const comparisons = input.include_comparisons
      ? [
          ...new Set(
            Object.keys(offenseRates ?? {}).flatMap((key) => {
              const name = rateEntity(key);
              return name === undefined || name === entity ? [] : [name];
            }),
          ),
        ].map((name) => {
          const offenses = offenseRates?.[`${name} Offenses`];
          const clearances = offenseRates?.[`${name} Clearances`];
          const theirs = denominators(name);
          return {
            entity_name: name,
            months: monthKeys.map(({ key, year, month }) => ({
              year,
              month,
              rate_per_100k: offenses?.[key] ?? null,
              clearance_rate_per_100k: clearances?.[key] ?? null,
              population: theirs.population?.[key] ?? null,
              participated_population: theirs.participated?.[key] ?? null,
              population_coverage_percent: theirs.coverage?.[key] ?? null,
            })),
          };
        })
      : undefined;

    ctx.log.info('fbi_get_crime_estimates completed', {
      months: months.length,
      comparisons: comparisons?.length,
    });

    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;
    const maxDataDate = data.cde_properties?.max_data_date?.UCR;

    return {
      scope: input.scope,
      offense: input.offense,
      entity_name: entity,
      ...(range.scope === 'state' && { state_abbr: range.stateAbbr }),
      ...(range.scope === 'agency' && { ori: range.ori }),
      from,
      to,
      months,
      total_months: months.length,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
      ...(maxDataDate && { max_data_date: maxDataDate }),
      ...(comparisons && { comparisons }),
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
    const populationFmt = (v: number | null) =>
      v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 20 });
    const lines: string[] = [
      `## FBI Crime Data — ${result.offense} (${scopeHeading(result)})`,
      scopeLine(result),
      `**Offense:** ${result.offense} | **Range:** ${result.from} → ${result.to}`,
      `**Entity:** ${escapeMarkdown(result.entity_name)}`,
      `**Months returned:** ${result.total_months}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    if (result.max_data_date) lines.push(`**Max data date:** ${result.max_data_date}`);
    lines.push(
      '',
      'Reporting coverage may be incomplete or unavailable. — means unavailable; coverage is supplied by CDE, not calculated from populations.',
      '| Year | Month | Rate/100k | Clearance Rate | Actual Count | Clearances | Population | Participating population | Population coverage |',
      '|:-----|:-----:|----------:|---------------:|-------------:|-----------:|-----------:|-------------------------:|--------------------:|',
    );
    const coverageFmt = (v: number | null) => (v !== null ? `${populationFmt(v)}%` : '—');
    for (const m of result.months) {
      lines.push(
        `| ${m.year} | ${String(m.month).padStart(2, '0')} | ${fmt(m.rate_per_100k)} | ${fmt(m.clearance_rate_per_100k)} | ${m.actual_count != null ? m.actual_count.toLocaleString() : '—'} | ${m.clearance_count != null ? m.clearance_count.toLocaleString() : '—'} | ${populationFmt(m.population)} | ${populationFmt(m.participated_population)} | ${coverageFmt(m.population_coverage_percent)} |`,
      );
    }
    if (result.comparisons) {
      lines.push(
        '',
        result.comparisons.length === 0
          ? 'No comparison entities were returned by CDE for this scope.'
          : 'Comparison entities CDE sent for the same months. Rates are per 100,000 participating population; CDE sends no counts for comparison entities.',
      );
      for (const comparison of result.comparisons) {
        lines.push(
          '',
          `### Comparison: ${escapeMarkdown(comparison.entity_name)}`,
          '| Year | Month | Rate/100k | Clearance Rate | Population | Participating population | Population coverage |',
          '|:-----|:-----:|----------:|---------------:|-----------:|-------------------------:|--------------------:|',
        );
        for (const m of comparison.months) {
          lines.push(
            `| ${m.year} | ${String(m.month).padStart(2, '0')} | ${fmt(m.rate_per_100k)} | ${fmt(m.clearance_rate_per_100k)} | ${populationFmt(m.population)} | ${populationFmt(m.participated_population)} | ${coverageFmt(m.population_coverage_percent)} |`,
          );
        }
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
