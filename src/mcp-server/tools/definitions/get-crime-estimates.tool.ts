/**
 * @fileoverview FBI CDE summarized offense data tool.
 * Returns monthly offense rates and counts from the /cde/summarized/ endpoint.
 * Replaces the decommissioned UCR /estimates/ endpoint.
 * @module mcp-server/tools/definitions/get-crime-estimates.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

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

/** Format a year+month into the MM-YYYY string the CDE API expects. */
function toApiDate(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}-${year}`;
}

/** Parse a MM-YYYY key into { year, month } numbers. */
function parseApiDate(key: string): { year: number; month: number } {
  const parts = key.split('-');
  return { month: parseInt(parts[0] ?? '1', 10), year: parseInt(parts[1] ?? '2000', 10) };
}

export const fbiGetCrimeEstimates = tool('fbi_get_crime_estimates', {
  title: 'FBI Get Crime Estimates',
  description:
    'Monthly offense rates (per 100k population), raw counts, population denominators and provider reporting coverage from FBI CDE. National scope omits identifiers; state requires only state_abbr; agency requires only ori. Identifiers are case-insensitive; start must be no later than end. Missing coverage stays null and participation may be incomplete. Offenses: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, homicide.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'invalid_date_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The complete starting year/month is later than the ending year/month.',
      recovery:
        'Correct from_year/from_month and to_year/to_month so the start is no later than the end.',
    },
    {
      reason: 'scope_param_incompatible',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Identifiers are supplied for a scope that does not apply them.',
      recovery:
        'For national scope omit state_abbr and ori; for state provide only state_abbr; for agency provide only ori.',
    },
    {
      reason: 'scope_param_missing',
      code: JsonRpcErrorCode.ValidationError,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr for state scope, or ori (9-character ORI code) for agency scope.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No data was returned for the requested offense and date range.',
      recovery:
        'Verify state_abbr or ori for the selected scope first, then check offense and date availability or broaden the date range.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe(
        'Geographic scope: national (omit identifiers), state (only state_abbr), or agency (only ori).',
      ),
    offense: z
      .enum(OFFENSE_VALUES)
      .describe(
        'Offense type: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, or homicide.',
      ),
    state_abbr: z
      .string()
      .length(2)
      .regex(/^[A-Za-z]{2}$/, 'Use two ASCII letters for state_abbr.')
      .optional()
      .describe(
        'Two ASCII-letter state abbreviation (e.g. CA, DC, PR); case-insensitive. Only permitted and required for state scope.',
      ),
    ori: z
      .string()
      .length(9)
      .regex(/^[A-Za-z0-9]{9}$/, 'Use nine ASCII letters or digits for ori.')
      .optional()
      .describe(
        'Nine ASCII-letter/digit ORI code (e.g. CA0010400, DCMPD0000); case-insensitive. Only permitted and required for agency scope.',
      ),
    from_year: z
      .number()
      .int()
      .min(2000)
      .max(2030)
      .describe('Start year of the data range (inclusive). The API uses monthly granularity.'),
    from_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(1)
      .describe('Start month (1–12). Defaults to January.'),
    to_year: z
      .number()
      .int()
      .min(2000)
      .max(2030)
      .describe('End year of the data range (inclusive).'),
    to_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(12)
      .describe('End month (1–12). Defaults to December.'),
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
              .describe('Offense rate per 100,000 population.'),
            clearance_rate_per_100k: z
              .number()
              .nullable()
              .optional()
              .describe('Clearance rate per 100,000 population.'),
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
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_crime_estimates', {
      scope: input.scope,
      offense: input.offense,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('scope_param_missing', 'state_abbr is required when scope is "state".');
    }
    if (input.scope === 'agency' && !input.ori) {
      throw ctx.fail('scope_param_missing', 'ori is required when scope is "agency".');
    }
    if (
      (input.scope !== 'state' && input.state_abbr !== undefined) ||
      (input.scope !== 'agency' && input.ori !== undefined)
    ) {
      throw ctx.fail(
        'scope_param_incompatible',
        `state_abbr or ori is not applicable to scope="${input.scope}".`,
      );
    }

    const from = toApiDate(input.from_year, input.from_month);
    const to = toApiDate(input.to_year, input.to_month);
    if (input.from_year * 12 + input.from_month > input.to_year * 12 + input.to_month) {
      throw ctx.fail('invalid_date_range', `Start ${from} is later than end ${to}.`);
    }
    const svc = getFbiApiService();
    // state_abbr and ori are validated above against their scope requirements
    const stateAbbr = input.state_abbr?.toUpperCase() as string;
    const ori = input.ori?.toUpperCase() as string;

    const data =
      input.scope === 'national'
        ? await svc.getSummarizedNational(input.offense, { from, to }, ctx)
        : input.scope === 'state'
          ? await svc.getSummarizedState(stateAbbr, input.offense, { from, to }, ctx)
          : await svc.getSummarizedAgency(ori, input.offense, { from, to }, ctx);

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

    const populationData = data.populations?.population?.[entity];
    const participatedData = data.populations?.participated_population?.[entity];
    const coverageData = data.tooltips?.['Percent of Population Coverage']?.[entity];

    const months = Array.from(allKeys)
      .map((key) => {
        const { year, month } = parseApiDate(key);
        return {
          year,
          month,
          rate_per_100k: rateData[key] ?? null,
          clearance_rate_per_100k: clearanceRateData[key] ?? null,
          actual_count: actualData[key] ?? null,
          clearance_count: clearanceActualData[key] ?? null,
          population: populationData?.[key] ?? null,
          participated_population: participatedData?.[key] ?? null,
          population_coverage_percent: coverageData?.[key] ?? null,
        };
      })
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    ctx.log.info('fbi_get_crime_estimates completed', { months: months.length });

    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;

    return {
      scope: input.scope,
      offense: input.offense,
      entity_name: entity,
      ...(input.scope === 'state' && { state_abbr: stateAbbr }),
      ...(input.scope === 'agency' && { ori }),
      from,
      to,
      months,
      total_months: months.length,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
      ...(data.cde_properties?.max_data_date?.UCR && {
        max_data_date: data.cde_properties.max_data_date.UCR,
      }),
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
    const populationFmt = (v: number | null) =>
      v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 20 });
    const scopeLabel =
      result.scope === 'national'
        ? 'National'
        : result.scope === 'state'
          ? (result.state_abbr ?? result.scope)
          : `ORI: ${result.ori ?? result.scope}`;
    const lines: string[] = [
      `## FBI Crime Data — ${result.offense} (${scopeLabel})`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}${result.ori ? ` | **ORI:** ${result.ori}` : ''}`,
      `**Offense:** ${result.offense} | **Range:** ${result.from} → ${result.to}`,
      `**Entity:** ${result.entity_name.replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&').replace(/\r\n|\r|\n/g, ' ')}`,
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
    for (const m of result.months) {
      lines.push(
        `| ${m.year} | ${String(m.month).padStart(2, '0')} | ${fmt(m.rate_per_100k)} | ${fmt(m.clearance_rate_per_100k)} | ${m.actual_count != null ? m.actual_count.toLocaleString() : '—'} | ${m.clearance_count != null ? m.clearance_count.toLocaleString() : '—'} | ${populationFmt(m.population)} | ${populationFmt(m.participated_population)} | ${m.population_coverage_percent != null ? `${populationFmt(m.population_coverage_percent)}%` : '—'} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
