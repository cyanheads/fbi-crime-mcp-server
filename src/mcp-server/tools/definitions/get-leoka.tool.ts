/**
 * @fileoverview FBI LEOKA (Law Enforcement Officers Killed and Assaulted) tool.
 * Returns officer fatality counts, weapon breakdowns, and circumstance data.
 * Endpoint: /cde/leoka/ytd?year={year} and /cde/leoka/monthly?year={year}&month={month}
 * @module mcp-server/tools/definitions/get-leoka.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetLeoka = tool('fbi_get_leoka', {
  title: 'FBI Get LEOKA',
  description:
    'Law Enforcement Officers Killed and Assaulted (LEOKA). Returns counts of officer fatalities (feloniously killed, accidentally killed), weapon breakdowns, officer activity at time of incident, geographic region, and year-over-year trends. Period "ytd" returns year-to-date totals for the specified year; "monthly" returns data for a specific month within a year (requires the month parameter).',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'month_required',
      code: JsonRpcErrorCode.InvalidParams,
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
        'Data period: ytd for year-to-date cumulative totals, monthly for a specific month.',
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
    /** YTD or monthly totals. */
    totals: z
      .object({
        total_officers: z
          .number()
          .optional()
          .describe('Total officers killed (felonious + accidental).'),
        total_incidents: z
          .number()
          .optional()
          .describe('Total incidents in which officers were killed.'),
        total_officers_felonious: z.number().optional().describe('Officers feloniously killed.'),
        total_officers_accidental: z.number().optional().describe('Officers accidentally killed.'),
        total_incidents_felonious: z
          .number()
          .optional()
          .describe('Incidents involving a felonious killing.'),
        total_incidents_accidental: z
          .number()
          .optional()
          .describe('Incidents involving an accidental killing.'),
      })
      .describe('Officer fatality totals for the period.'),
    /** Weapon type counts for the period. */
    weapons: z
      .record(z.string(), z.number())
      .optional()
      .describe(
        'Count of officers killed/assaulted by weapon type (e.g. Handguns, Rifles, Vehicle).',
      ),
    /** Officer activity at time of incident. */
    officer_activity: z
      .record(z.string(), z.number())
      .optional()
      .describe('Count by what the officer was doing at the time of the incident.'),
    /** Year-over-year death trend. */
    deaths_by_year: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Annual officer death totals by type. Keys: "Felonious", "Accidental". Values: { "2022": 61, ... }',
      ),
    /** Geographic region breakdown. */
    deaths_by_region: z
      .record(z.string(), z.number())
      .optional()
      .describe('Officer death counts by geographic region (e.g. South, Northeast).'),
    /** Lighting conditions at time of incident. */
    lighting_conditions: z
      .record(z.string(), z.number())
      .optional()
      .describe('Count by lighting conditions at time of incident.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_leoka', { period: input.period, year: input.year, month: input.month });

    if (input.period === 'monthly' && input.month === undefined) {
      throw ctx.fail('month_required', 'month is required when period is "monthly".', {
        ...ctx.recoveryFor('month_required'),
      });
    }

    const svc = getFbiApiService();
    const chartData =
      input.period === 'ytd'
        ? await svc.getLeokaYtd({ year: input.year }, ctx)
        : await svc.getLeokaMonthly({ year: input.year, month: input.month as number }, ctx);

    const rawTotals = chartData.incidents_victim_officer_totals_ytd;
    if (!rawTotals) {
      throw ctx.fail(
        'no_data',
        `No LEOKA data found for year=${input.year}${input.month ? `, month=${input.month}` : ''}.`,
        {
          ...ctx.recoveryFor('no_data'),
        },
      );
    }

    ctx.log.info('fbi_get_leoka completed', { year: input.year, period: input.period });
    return {
      period: input.period,
      year: input.year,
      ...(input.month !== undefined && { month: input.month }),
      totals: {
        ...(rawTotals.total_officers !== undefined && { total_officers: rawTotals.total_officers }),
        ...(rawTotals.total_incidents !== undefined && {
          total_incidents: rawTotals.total_incidents,
        }),
        ...(rawTotals.total_officers_dod !== undefined && {
          total_officers_felonious: rawTotals.total_officers_dod,
        }),
        ...(rawTotals.total_officers_doi !== undefined && {
          total_officers_accidental: rawTotals.total_officers_doi,
        }),
        ...(rawTotals.total_incidents_dod !== undefined && {
          total_incidents_felonious: rawTotals.total_incidents_dod,
        }),
        ...(rawTotals.total_incidents_doi !== undefined && {
          total_incidents_accidental: rawTotals.total_incidents_doi,
        }),
      },
      ...(chartData.weapons && { weapons: chartData.weapons }),
      ...(chartData.officer_activity && { officer_activity: chartData.officer_activity }),
      ...(chartData.officer_death_by_year && { deaths_by_year: chartData.officer_death_by_year }),
      ...(chartData.officer_death_by_geographic_region && {
        deaths_by_region: chartData.officer_death_by_geographic_region,
      }),
      ...(chartData.lighting_conditions && { lighting_conditions: chartData.lighting_conditions }),
    };
  },

  format: (result) => {
    const lines: string[] = [
      `## FBI LEOKA — ${result.period === 'ytd' ? 'Year-to-Date' : 'Monthly'} ${result.period} (${result.year}${result.month ? `-${String(result.month).padStart(2, '0')}` : ''})`,
      '',
      '### Officer Fatality Totals',
      `| Metric | Count |`,
      `|:-------|------:|`,
    ];
    const t = result.totals;
    if (t.total_officers !== undefined)
      lines.push(`| Officers killed (total) | ${t.total_officers} |`);
    if (t.total_officers_felonious !== undefined)
      lines.push(`| Officers feloniously killed | ${t.total_officers_felonious} |`);
    if (t.total_officers_accidental !== undefined)
      lines.push(`| Officers accidentally killed | ${t.total_officers_accidental} |`);
    if (t.total_incidents !== undefined) lines.push(`| Total incidents | ${t.total_incidents} |`);
    if (t.total_incidents_felonious !== undefined)
      lines.push(`| Felonious-killing incidents | ${t.total_incidents_felonious} |`);
    if (t.total_incidents_accidental !== undefined)
      lines.push(`| Accidental-killing incidents | ${t.total_incidents_accidental} |`);

    if (result.weapons && Object.keys(result.weapons).length > 0) {
      lines.push('', '### Weapons Used');
      lines.push('| Weapon | Count |', '|:-------|------:|');
      for (const [k, v] of Object.entries(result.weapons).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
      }
    }

    if (result.officer_activity && Object.keys(result.officer_activity).length > 0) {
      lines.push('', '### Officer Activity at Time of Incident');
      lines.push('| Activity | Count |', '|:---------|------:|');
      for (const [k, v] of Object.entries(result.officer_activity).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
      }
    }

    if (result.deaths_by_year) {
      lines.push('', '### Annual Trend (Officers Killed)');
      lines.push('| Year | Felonious | Accidental |', '|:-----|----------:|----------:|');
      const felonious = (result.deaths_by_year['Felonious'] ?? {}) as Record<string, number>;
      const accidental = (result.deaths_by_year['Accidental'] ?? {}) as Record<string, number>;
      const years = [...new Set([...Object.keys(felonious), ...Object.keys(accidental)])].sort();
      for (const yr of years) {
        lines.push(`| ${yr} | ${felonious[yr] ?? '—'} | ${accidental[yr] ?? '—'} |`);
      }
    }

    if (result.deaths_by_region && Object.keys(result.deaths_by_region).length > 0) {
      lines.push('', '### Deaths by Geographic Region');
      lines.push('| Region | Count |', '|:-------|------:|');
      for (const [k, v] of Object.entries(result.deaths_by_region).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
      }
    }

    if (result.lighting_conditions && Object.keys(result.lighting_conditions).length > 0) {
      lines.push('', '### Lighting Conditions');
      lines.push('| Condition | Count |', '|:----------|------:|');
      for (const [k, v] of Object.entries(result.lighting_conditions).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
      }
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
