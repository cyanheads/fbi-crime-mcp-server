/**
 * @fileoverview FBI UCR national arrest counts tool.
 * Returns annual arrest counts by offense type, disaggregated by age, sex, and race.
 * @module mcp-server/tools/definitions/get-arrests.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetArrests = tool('fbi_get_arrests', {
  title: 'FBI Get Arrests',
  description:
    '**UCR Summary. National only.** Annual arrest counts by offense type, disaggregated by age group (juvenile/adult), sex, and race. Covers UCR Part I (violent and property) and Part II offenses. State-level arrest breakdowns are not available via this API — this endpoint returns national totals only.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No arrest data was returned for the requested year range.',
      recovery:
        'Broaden the year range — arrest data may only be available through a certain year. Try omitting since_year and until_year to retrieve all available data.',
    },
  ],

  input: z.object({
    since_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Starting year (inclusive). Defaults to earliest available.'),
    until_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Ending year (inclusive). Defaults to most recent available.'),
  }),

  output: z.object({
    arrests: z
      .array(
        z
          .object({
            year: z.number().optional().describe('Data year.'),
            offense: z.string().optional().describe('UCR offense category name.'),
            male_juv: z.number().nullable().optional().describe('Male juvenile arrests.'),
            female_juv: z.number().nullable().optional().describe('Female juvenile arrests.'),
            male_adult: z.number().nullable().optional().describe('Male adult arrests.'),
            female_adult: z.number().nullable().optional().describe('Female adult arrests.'),
            white: z.number().nullable().optional().describe('White arrests (all ages).'),
            black: z.number().nullable().optional().describe('Black arrests (all ages).'),
            asian: z.number().nullable().optional().describe('Asian arrests (all ages).'),
            native_american: z
              .number()
              .nullable()
              .optional()
              .describe('Native American/Alaska Native arrests.'),
            pacific_islander: z
              .number()
              .nullable()
              .optional()
              .describe('Native Hawaiian/Pacific Islander arrests.'),
            total: z
              .number()
              .nullable()
              .optional()
              .describe('Total arrests across all demographics.'),
          })
          .describe('A single arrest count row.'),
      )
      .describe('Annual arrest rows by offense type and demographic breakdown.'),
    totalRows: z.number().describe('Total rows returned.'),
    note: z.string().describe('Scope note: this data is national-only.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_arrests', { since: input.since_year, until: input.until_year });
    const svc = getFbiApiService();
    const yearParams = {
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };
    const rows = await svc.getArrestsNational(yearParams, ctx);

    if (rows.length === 0) {
      throw ctx.fail('no_data', 'No arrest data found for the requested year range.', {
        ...ctx.recoveryFor('no_data'),
      });
    }

    ctx.log.info('fbi_get_arrests completed', { rows: rows.length });
    return {
      arrests: rows,
      totalRows: rows.length,
      note: 'National-only data. State-level arrest breakdowns are not available via this API.',
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const lines: string[] = [
      '## FBI UCR National Arrest Counts',
      `**Rows returned:** ${result.totalRows}`,
      `\n> **Note:** ${result.note}`,
      '',
      '| Year | Offense | Total | Male Juv | Female Juv | Male Adult | Female Adult | White | Black | Asian | Native Am. | Pacific Is. |',
      '|:-----|:--------|------:|:---------|:-----------|:-----------|:-------------|:------|:------|:------|:-----------|:------------|',
    ];
    for (const r of result.arrests) {
      lines.push(
        `| ${r.year ?? '—'} | ${r.offense ?? '—'} | ${fmt(r.total)} | ${fmt(r.male_juv)} | ${fmt(r.female_juv)} | ${fmt(r.male_adult)} | ${fmt(r.female_adult)} | ${fmt(r.white)} | ${fmt(r.black)} | ${fmt(r.asian)} | ${fmt(r.native_american)} | ${fmt(r.pacific_islander)} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
