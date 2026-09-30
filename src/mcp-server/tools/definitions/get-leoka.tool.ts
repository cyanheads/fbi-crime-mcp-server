/**
 * @fileoverview FBI LEOKA (Law Enforcement Officers Killed and Assaulted) tool.
 * Returns officer fatality counts, weapon breakdowns, and circumstance data.
 * Endpoint: /cde/leoka/ytd?year={year} and /cde/leoka/monthly?year={year}&month={month}
 * @module mcp-server/tools/definitions/get-leoka.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';
import {
  CountMapSchema,
  FbiLeokaTotalsSchema,
  MonthlyCountMapSchema,
  NestedCountMapSchema,
} from '@/services/fbi-api/types.js';

type CountTree = { [key: string]: number | null | CountTree };

/** Escape table delimiters and line breaks without changing structured keys. */
function cell(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r\n|\r|\n/g, '<br>');
}

/** Render every supplied path, including empty groups and unavailable counts. */
function countTable(title: string, data: CountTree | undefined, dimensions: string[]): string[] {
  if (data === undefined) return [];
  const lines = ['', `### ${title}`];
  if (Object.keys(data).length === 0) return [...lines, 'No reported entries.'];
  lines.push(
    `| ${[...dimensions, 'Count'].join(' | ')} |`,
    `| ${[...dimensions.map(() => ':---'), '---:'].join(' | ')} |`,
  );
  const visit = (value: CountTree | number | null, path: string[]): void => {
    if (value !== null && typeof value === 'object' && Object.keys(value).length > 0) {
      const entries = Object.entries(value);
      if (dimensions.length === 1)
        entries.sort(
          (a, b) => (typeof b[1] === 'number' ? b[1] : 0) - (typeof a[1] === 'number' ? a[1] : 0),
        );
      for (const [key, child] of entries) visit(child, [...path, cell(key)]);
      return;
    }
    const label =
      value === null
        ? 'Unavailable'
        : typeof value === 'number'
          ? String(value)
          : 'No reported entries';
    lines.push(
      `| ${[...path, ...Array<string>(dimensions.length - path.length).fill('—'), label].join(' | ')} |`,
    );
  };
  visit(data, []);
  return lines;
}

/** Keep region/year comparisons side by side while retaining every killing type. */
function comparisonTable(
  title: string,
  dimension: 'Year' | 'Region',
  data: z.infer<typeof NestedCountMapSchema> | undefined,
): string[] {
  if (data === undefined) return [];
  const lines = ['', `### ${title}`];
  const types = Object.keys(data);
  if (types.length === 0) return [...lines, 'No reported entries.'];
  const keys = [...new Set(Object.values(data).flatMap((group) => Object.keys(group ?? {})))];
  const total = (key: string) =>
    Object.values(data).reduce((sum, group) => sum + (group?.[key] ?? 0), 0);
  keys.sort(dimension === 'Region' ? (a, b) => total(b) - total(a) : undefined);
  for (const [type, group] of Object.entries(data)) {
    if (group === null) lines.push(`${cell(type)}: Unavailable.`);
    else if (Object.keys(group).length === 0) lines.push(`${cell(type)}: No reported entries.`);
  }
  if (keys.length > 0) {
    lines.push(
      `| ${[dimension, ...types.map(cell)].join(' | ')} |`,
      `| :--- | ${types.map(() => '---:').join(' | ')} |`,
    );
    for (const key of keys)
      lines.push(
        `| ${[cell(key), ...types.map((type) => data[type]?.[key] ?? '—')].join(' | ')} |`,
      );
  }
  return lines;
}

export const fbiGetLeoka = tool('fbi_get_leoka', {
  title: 'FBI Get LEOKA',
  description:
    'LEOKA officer fatality trends, weapons, activity, circumstances, demographics, geographic regions, and time-of-day/month breakdowns. Period "ytd" requests a year; "monthly" requires month and includes comparison-year monthly series. Both periods return the CDE YTD totals block, separately from month-specific breakdowns. Raw dod/doi totals have unspecified interpretation; classified deaths remain in the trend and region series.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'month_required',
      code: JsonRpcErrorCode.ValidationError,
      when: 'period is "monthly" but the month parameter was not provided.',
      recovery: 'Provide a month (1–12) when requesting monthly LEOKA data.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'The API returned no LEOKA data for the requested year/month.',
      recovery:
        'Try a different year. LEOKA data typically lags by 6–12 months. The API requires a valid year parameter.',
    },
  ],

  input: z.object({
    period: z
      .enum(['ytd', 'monthly'])
      .describe(
        'Data period: ytd for the year, monthly for month-specific breakdowns and comparison years. Both include the CDE YTD totals block.',
      ),
    year: z
      .number()
      .int()
      .min(2000)
      .max(2030)
      .describe('Year to retrieve LEOKA data for. Required — the API does not default to a year.'),
    month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe('Month number (1–12). Required when period is "monthly".'),
  }),

  output: z.object({
    period: z.string().describe('The requested data period.'),
    year: z.number().describe('The data year requested.'),
    month: z.number().optional().describe('The data month, when period is "monthly".'),
    totals: FbiLeokaTotalsSchema.describe(
      'Raw incidents_victim_officer_totals_ytd block, including in monthly responses. Not combined fatalities or requested-month totals.',
    ),
    /** Weapon type counts for the period. */
    weapons: CountMapSchema.optional().describe(
      'Count by weapon type (e.g. Handguns, Rifles, Vehicle).',
    ),
    /** Officer activity at time of incident. */
    officer_activity: CountMapSchema.optional().describe(
      'Count by what the officer was doing at the time of the incident.',
    ),
    /** Year-over-year death trend. */
    deaths_by_year: NestedCountMapSchema.optional().describe(
      'Annual officer death totals by type. Keys: "Felonious", "Accidental". Values: { "2022": 61, ... }',
    ),
    /** Geographic region breakdown by killing type. */
    deaths_by_region: NestedCountMapSchema.optional().describe(
      'Officer death counts by killing type then region. Keys: "Felonious", "Accidental". Values: { "South": 31, "West": 12, ... }',
    ),
    /** Lighting conditions at time of incident. */
    lighting_conditions: CountMapSchema.optional().describe(
      'Count by lighting conditions at time of incident.',
    ),
    body_armor_worn: CountMapSchema.optional().describe(
      'Body armor worn category to count; null counts are unavailable.',
    ),
    location_of_attack: CountMapSchema.optional().describe(
      'Location of attack category to count; all reported categories are retained.',
    ),
    offender_previously_known_to_agency: CountMapSchema.optional().describe(
      'Previously known offender category to count.',
    ),
    offender_prior_mental_illness: CountMapSchema.optional().describe(
      'Offender prior mental illness category to count.',
    ),
    offender_prior_relationship: CountMapSchema.optional().describe(
      'Offender prior relationship category to count.',
    ),
    officer_circumstances_time_of_attack: CountMapSchema.optional().describe(
      'Circumstance at time of attack category to count.',
    ),
    officer_incident_type: CountMapSchema.optional().describe('Officer incident type to count.'),
    officer_type_of_assignment: CountMapSchema.optional().describe(
      'Officer assignment type to count.',
    ),
    weather_conditions: CountMapSchema.optional().describe('Weather condition to count.'),
    offender_demographic: NestedCountMapSchema.optional().describe(
      'Offender demographic dimension to category to count; null groups and counts are unavailable.',
    ),
    officer_demographic: NestedCountMapSchema.optional().describe(
      'Officer demographic dimension to category to count; null groups and counts are unavailable.',
    ),
    officer_death_by_time_of_day: NestedCountMapSchema.optional().describe(
      'Killing type to hour key to count. Hour keys, including -1, are preserved literally.',
    ),
    officer_death_by_month: MonthlyCountMapSchema.optional().describe(
      'Killing type to year to month to count. Includes returned comparison years and zero values without filtering.',
    ),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_leoka', { period: input.period, year: input.year, month: input.month });

    if (input.period === 'monthly' && input.month === undefined) {
      throw ctx.fail('month_required', 'month is required when period is "monthly".');
    }

    const svc = getFbiApiService();
    const chartData =
      input.period === 'ytd'
        ? await svc.getLeokaYtd({ year: input.year }, ctx)
        : await svc.getLeokaMonthly({ year: input.year, month: input.month as number }, ctx);

    const rawTotals = chartData?.incidents_victim_officer_totals_ytd;
    if (!chartData || !rawTotals) {
      throw ctx.fail(
        'no_data',
        `No LEOKA data found for year=${input.year}${input.month ? `, month=${input.month}` : ''}.`,
      );
    }

    ctx.log.info('fbi_get_leoka completed', { year: input.year, period: input.period });
    return {
      period: input.period,
      year: input.year,
      ...(input.month !== undefined && { month: input.month }),
      totals: rawTotals,
      ...(chartData.weapons && { weapons: chartData.weapons }),
      ...(chartData.officer_activity && { officer_activity: chartData.officer_activity }),
      ...(chartData.officer_death_by_year && { deaths_by_year: chartData.officer_death_by_year }),
      ...(chartData.officer_death_by_geographic_region && {
        deaths_by_region: chartData.officer_death_by_geographic_region,
      }),
      ...(chartData.lighting_conditions && { lighting_conditions: chartData.lighting_conditions }),
      ...(chartData.body_armor_worn && { body_armor_worn: chartData.body_armor_worn }),
      ...(chartData.location_of_attack && { location_of_attack: chartData.location_of_attack }),
      ...(chartData.offender_previously_known_to_agency && {
        offender_previously_known_to_agency: chartData.offender_previously_known_to_agency,
      }),
      ...(chartData.offender_prior_mental_illness && {
        offender_prior_mental_illness: chartData.offender_prior_mental_illness,
      }),
      ...(chartData.offender_prior_relationship && {
        offender_prior_relationship: chartData.offender_prior_relationship,
      }),
      ...(chartData.officer_circumstances_time_of_attack && {
        officer_circumstances_time_of_attack: chartData.officer_circumstances_time_of_attack,
      }),
      ...(chartData.officer_incident_type && {
        officer_incident_type: chartData.officer_incident_type,
      }),
      ...(chartData.officer_type_of_assignment && {
        officer_type_of_assignment: chartData.officer_type_of_assignment,
      }),
      ...(chartData.weather_conditions && { weather_conditions: chartData.weather_conditions }),
      ...(chartData.offender_demographic && {
        offender_demographic: chartData.offender_demographic,
      }),
      ...(chartData.officer_demographic && { officer_demographic: chartData.officer_demographic }),
      ...(chartData.officer_death_by_time_of_day && {
        officer_death_by_time_of_day: chartData.officer_death_by_time_of_day,
      }),
      ...(chartData.officer_death_by_month && {
        officer_death_by_month: chartData.officer_death_by_month,
      }),
    };
  },

  format: (result) => {
    const lines: string[] = [
      `## FBI LEOKA — ${result.period === 'ytd' ? 'Year-to-Date' : 'Monthly'} ${result.period} (${result.year}${result.month ? `-${String(result.month).padStart(2, '0')}` : ''})`,
      '',
      '### CDE YTD Totals',
      'Source: incidents_victim_officer_totals_ytd. These are not combined fatality counts or requested-month totals. The upstream dod/doi abbreviations have unspecified interpretation.',
      '| Metric | Count |',
      '|:-------|------:|',
    ];
    for (const [key, value] of Object.entries(result.totals)) {
      if (value === undefined) continue;
      const label =
        key === 'total_officers'
          ? 'CDE YTD total officers'
          : key === 'total_incidents'
            ? 'CDE YTD total incidents'
            : key;
      lines.push(`| ${label} | ${value ?? 'Unavailable'} |`);
    }
    if (Object.keys(result.totals).length === 0) lines.push('No reported entries.');
    lines.push(
      ...countTable('Weapons Used', result.weapons, ['Weapon']),
      ...countTable('Officer Activity at Time of Incident', result.officer_activity, ['Activity']),
      ...comparisonTable('Annual Trend (Officers Killed)', 'Year', result.deaths_by_year),
      ...comparisonTable('Deaths by Geographic Region', 'Region', result.deaths_by_region),
      ...countTable('Lighting Conditions', result.lighting_conditions, ['Condition']),
      ...countTable('body_armor_worn', result.body_armor_worn, ['Category']),
      ...countTable('location_of_attack', result.location_of_attack, ['Category']),
      ...countTable(
        'offender_previously_known_to_agency',
        result.offender_previously_known_to_agency,
        ['Category'],
      ),
      ...countTable('offender_prior_mental_illness', result.offender_prior_mental_illness, [
        'Category',
      ]),
      ...countTable('offender_prior_relationship', result.offender_prior_relationship, [
        'Category',
      ]),
      ...countTable(
        'officer_circumstances_time_of_attack',
        result.officer_circumstances_time_of_attack,
        ['Category'],
      ),
      ...countTable('officer_incident_type', result.officer_incident_type, ['Category']),
      ...countTable('officer_type_of_assignment', result.officer_type_of_assignment, ['Category']),
      ...countTable('weather_conditions', result.weather_conditions, ['Category']),
      ...countTable('offender_demographic', result.offender_demographic, ['Dimension', 'Category']),
      ...countTable('officer_demographic', result.officer_demographic, ['Dimension', 'Category']),
      ...countTable('officer_death_by_time_of_day', result.officer_death_by_time_of_day, [
        'Killing type',
        'Hour',
      ]),
      ...countTable('officer_death_by_month', result.officer_death_by_month, [
        'Killing type',
        'Year',
        'Month',
      ]),
    );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
