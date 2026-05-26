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
    'Monthly offense rates (per 100k population) and raw counts for national, state, or agency scope. Data comes from the FBI Crime Data Explorer summarized endpoint. Returns month-by-month data for the requested offense and date range. Use scope "national" or "state" for aggregate trends; scope "agency" for a single law enforcement agency by ORI code. Offense options: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, homicide.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'scope_param_missing',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr for state scope, or ori (9-character ORI code) for agency scope.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No data was returned for the requested offense and date range.',
      recovery:
        'Broaden the date range or try a different offense type. Data availability varies by year and scope.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe(
        'Geographic scope: national, state (requires state_abbr), or agency (requires ori).',
      ),
    offense: z
      .enum(OFFENSE_VALUES)
      .describe(
        'Offense type: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, or homicide.',
      ),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation (e.g. CA). Required when scope is "state".'),
    ori: z
      .string()
      .length(9)
      .optional()
      .describe('9-character ORI agency code. Required when scope is "agency".'),
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
          })
          .describe('One month of offense data.'),
      )
      .describe('Monthly data rows sorted chronologically.'),
    total_months: z.number().describe('Number of months returned.'),
    data_last_updated: z.string().optional().describe('Date the CDE last refreshed this data.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_crime_estimates', {
      scope: input.scope,
      offense: input.offense,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('scope_param_missing', 'state_abbr is required when scope is "state".', {
        ...ctx.recoveryFor('scope_param_missing'),
      });
    }
    if (input.scope === 'agency' && !input.ori) {
      throw ctx.fail('scope_param_missing', 'ori is required when scope is "agency".', {
        ...ctx.recoveryFor('scope_param_missing'),
      });
    }

    const from = toApiDate(input.from_year, input.from_month);
    const to = toApiDate(input.to_year, input.to_month);
    const svc = getFbiApiService();
    // state_abbr and ori are validated above against their scope requirements
    const stateAbbr = input.state_abbr as string;
    const ori = input.ori as string;

    const data =
      input.scope === 'national'
        ? await svc.getSummarizedNational(input.offense, { from, to }, ctx)
        : input.scope === 'state'
          ? await svc.getSummarizedState(stateAbbr, input.offense, { from, to }, ctx)
          : await svc.getSummarizedAgency(ori, input.offense, { from, to }, ctx);

    // Find the primary offense/clearance keys in the response.
    // National: "United States Offenses" / "United States Clearances"
    // State: "{State} Offenses" / "{State} Clearances"
    // Agency: "{Agency} Offenses" / "{Agency} Clearances"
    const offenseRates = data.offenses.rates;
    const offenseActuals = data.offenses.actuals;

    const offenseKey = Object.keys(offenseRates).find((k) => k.endsWith('Offenses')) ?? '';
    const clearanceKey = Object.keys(offenseRates).find((k) => k.endsWith('Clearances')) ?? '';
    const actualOffenseKey = Object.keys(offenseActuals).find((k) => k.endsWith('Offenses')) ?? '';
    const actualClearanceKey =
      Object.keys(offenseActuals).find((k) => k.endsWith('Clearances')) ?? '';

    const rateData = offenseRates[offenseKey] ?? {};
    const clearanceRateData = offenseRates[clearanceKey] ?? {};
    const actualData = offenseActuals[actualOffenseKey] ?? {};
    const clearanceActualData = offenseActuals[actualClearanceKey] ?? {};

    // Collect all month keys and build sorted rows
    const allKeys = new Set([...Object.keys(rateData), ...Object.keys(actualData)]);

    if (allKeys.size === 0) {
      throw ctx.fail(
        'no_data',
        `No data returned for offense="${input.offense}" scope="${input.scope}" from=${from} to=${to}.`,
        { ...ctx.recoveryFor('no_data') },
      );
    }

    const months = Array.from(allKeys)
      .map((key) => {
        const { year, month } = parseApiDate(key);
        return {
          year,
          month,
          _key: key,
          rate_per_100k: rateData[key] ?? null,
          clearance_rate_per_100k: clearanceRateData[key] ?? null,
          actual_count: actualData[key] ?? null,
          clearance_count: clearanceActualData[key] ?? null,
        };
      })
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
      .map(({ _key: _k, ...rest }) => rest);

    ctx.log.info('fbi_get_crime_estimates completed', { months: months.length });

    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;

    return {
      scope: input.scope,
      offense: input.offense,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      ...(input.ori && { ori: input.ori }),
      from,
      to,
      months,
      total_months: months.length,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
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
      `**Months returned:** ${result.total_months}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    lines.push(
      '',
      '| Year | Month | Rate/100k | Clearance Rate | Actual Count | Clearances |',
      '|:-----|:-----:|----------:|---------------:|-------------:|-----------:|',
    );
    for (const m of result.months) {
      lines.push(
        `| ${m.year} | ${String(m.month).padStart(2, '0')} | ${fmt(m.rate_per_100k)} | ${fmt(m.clearance_rate_per_100k)} | ${m.actual_count != null ? m.actual_count.toLocaleString() : '—'} | ${m.clearance_count != null ? m.clearance_count.toLocaleString() : '—'} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
