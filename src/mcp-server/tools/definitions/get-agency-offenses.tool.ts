/**
 * @fileoverview FBI agency offense data tool (redirected to summarized endpoint).
 * The original UCR /agencies/count/ endpoints are decommissioned.
 * Use fbi_get_crime_estimates with scope="agency" for agency-level offense data.
 * @module mcp-server/tools/definitions/get-agency-offenses.tool
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

function toApiDate(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}-${year}`;
}

function parseApiDate(key: string): { year: number; month: number } {
  const parts = key.split('-');
  return { month: parseInt(parts[0] ?? '1', 10), year: parseInt(parts[1] ?? '2000', 10) };
}

export const fbiGetAgencyOffenses = tool('fbi_get_agency_offenses', {
  title: 'FBI Get Agency Offenses',
  description:
    'Monthly offense rates and counts for a specific law enforcement agency (by ORI code), a state, or the national scope. Data comes from the FBI CDE summarized endpoint. Returns per-100k rates and raw actuals by month. The original UCR per-agency breakdown endpoint has been decommissioned — this tool uses the summarized endpoint which provides comparable trend data. Offense options: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, homicide.',
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
      when: 'No data returned for the requested parameters.',
      recovery:
        'Verify the ORI code or state abbreviation, broaden the date range, or try a different offense type.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe('Data scope: national, state (requires state_abbr), or agency (requires ori).'),
    offense: z
      .enum(OFFENSE_VALUES)
      .describe(
        'Offense type: violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, or homicide.',
      ),
    ori: z
      .string()
      .length(9)
      .optional()
      .describe('9-character ORI code for a single agency. Required when scope is "agency".'),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation. Required when scope is "state".'),
    from_year: z.number().int().min(2000).max(2030).describe('Start year of the data range.'),
    from_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(1)
      .describe('Start month (1–12). Defaults to January.'),
    to_year: z.number().int().min(2000).max(2030).describe('End year of the data range.'),
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
    ori: z.string().optional().describe('ORI code when scope is "agency".'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is "state".'),
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
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_agency_offenses', {
      scope: input.scope,
      offense: input.offense,
      ori: input.ori,
      state_abbr: input.state_abbr,
    });

    if (input.scope === 'agency' && !input.ori) {
      throw ctx.fail('scope_param_missing', 'ori is required when scope is "agency".', {
        ...ctx.recoveryFor('scope_param_missing'),
      });
    }
    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('scope_param_missing', 'state_abbr is required when scope is "state".', {
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

    ctx.log.info('fbi_get_agency_offenses completed', { months: months.length });
    return {
      scope: input.scope,
      offense: input.offense,
      ...(input.ori && { ori: input.ori }),
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      from,
      to,
      months,
      total_months: months.length,
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
      `## FBI Agency Offense Data — ${result.offense} (${scopeLabel})`,
      `**Scope:** ${result.scope}${result.ori ? ` | **ORI:** ${result.ori}` : ''}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}`,
      `**Offense:** ${result.offense} | **Range:** ${result.from} → ${result.to}`,
      `**Months returned:** ${result.total_months}`,
      '',
      '| Year | Month | Rate/100k | Clearance Rate | Actual Count | Clearances |',
      '|:-----|:-----:|----------:|---------------:|-------------:|-----------:|',
    ];
    for (const m of result.months) {
      lines.push(
        `| ${m.year} | ${String(m.month).padStart(2, '0')} | ${fmt(m.rate_per_100k)} | ${fmt(m.clearance_rate_per_100k)} | ${m.actual_count != null ? m.actual_count.toLocaleString() : '—'} | ${m.clearance_count != null ? m.clearance_count.toLocaleString() : '—'} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
