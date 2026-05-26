/**
 * @fileoverview FBI LEOKA (Law Enforcement Officers Killed and Assaulted) tool.
 * Returns officer fatality and assault counts by month or year-to-date.
 * @module mcp-server/tools/definitions/get-leoka.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetLeoka = tool('fbi_get_leoka', {
  title: 'FBI Get LEOKA',
  description:
    'Law Enforcement Officers Killed and Assaulted (LEOKA). Returns counts of officer fatalities (feloniously killed, accidentally killed) and assaults with circumstance and weapon detail, by month or year-to-date. Use for officer safety trend analysis or to provide denominator context alongside staffing data from fbi_get_agency. Period "monthly" returns one row per month; "ytd" returns cumulative year-to-date totals.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No LEOKA data was returned for the requested period and year.',
      recovery:
        'Try a different year or omit the year parameter to retrieve the most recent available data.',
    },
  ],

  input: z.object({
    period: z
      .enum(['monthly', 'ytd'])
      .describe(
        'Data period: monthly for individual month rows, ytd for cumulative year-to-date totals.',
      ),
    year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Year to retrieve LEOKA data for. Defaults to the most recent available year.'),
  }),

  output: z.object({
    period: z.string().describe('The requested data period.'),
    year: z.number().optional().describe('The data year, if available from the response.'),
    records: z
      .array(
        z
          .object({
            year: z.number().optional().describe('Data year.'),
            month: z
              .number()
              .nullable()
              .optional()
              .describe('Month number (1–12) for monthly period; null for ytd.'),
            total_felony: z.number().nullable().optional().describe('Officers feloniously killed.'),
            total_accident: z
              .number()
              .nullable()
              .optional()
              .describe('Officers accidentally killed.'),
            total_assaults: z.number().nullable().optional().describe('Total officer assaults.'),
            firearm: z
              .number()
              .nullable()
              .optional()
              .describe('Assaults/killings involving a firearm.'),
            knife: z
              .number()
              .nullable()
              .optional()
              .describe('Assaults/killings involving a knife or cutting instrument.'),
            hands: z
              .number()
              .nullable()
              .optional()
              .describe('Assaults involving personal weapons (hands, fists, feet).'),
            other: z
              .number()
              .nullable()
              .optional()
              .describe('Assaults/killings involving other weapons.'),
          })
          .describe('A single LEOKA record row.'),
      )
      .describe('LEOKA records for the requested period.'),
    totalRows: z.number().describe('Total rows returned.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_leoka', { period: input.period, year: input.year });
    const svc = getFbiApiService();
    const yearParam = input.year !== undefined ? { year: input.year } : {};
    const rows =
      input.period === 'monthly'
        ? await svc.getLeokaMonthly(yearParam, ctx)
        : await svc.getLeokaYtd(yearParam, ctx);

    if (rows.length === 0) {
      throw ctx.fail(
        'no_data',
        `No LEOKA data found for period="${input.period}"${input.year ? `, year=${input.year}` : ''}.`,
        {
          ...ctx.recoveryFor('no_data'),
        },
      );
    }

    ctx.log.info('fbi_get_leoka completed', { rows: rows.length });
    const firstYear = rows.find((r) => r.year !== undefined)?.year;
    return {
      period: input.period,
      ...(firstYear !== undefined && { year: firstYear }),
      records: rows,
      totalRows: rows.length,
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const lines: string[] = [
      `## FBI LEOKA — ${result.period === 'monthly' ? 'Monthly' : 'Year-to-Date'}${result.year ? ` (${result.year})` : ''}`,
      `**Period:** ${result.period}${result.year ? ` | **Year:** ${result.year}` : ''}`,
      `**Rows returned:** ${result.totalRows}`,
      '',
      '| Year | Month | Felony Deaths | Accidental Deaths | Total Assaults | Firearm | Knife | Hands | Other |',
      '|:-----|:------|:-------------|:-----------------|:--------------|:--------|:------|:------|:------|',
    ];
    for (const r of result.records) {
      lines.push(
        `| ${r.year ?? '—'} | ${r.month ?? 'YTD'} | ${fmt(r.total_felony)} | ${fmt(r.total_accident)} | ${fmt(r.total_assaults)} | ${fmt(r.firearm)} | ${fmt(r.knife)} | ${fmt(r.hands)} | ${fmt(r.other)} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
