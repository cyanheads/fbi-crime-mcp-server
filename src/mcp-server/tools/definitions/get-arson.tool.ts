/**
 * @fileoverview FBI arson offense counts tool.
 * Returns arson counts at national or state level by year.
 * @module mcp-server/tools/definitions/get-arson.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetArson = tool('fbi_get_arson', {
  title: 'FBI Get Arson',
  description:
    'Arson offense counts at national or state level by year. Arson is tracked under a separate UCR reporting track with lower participation than the main crime series. Do not combine these figures with fbi_get_crime_estimates property crime totals without noting the separate methodology — arson is deliberately excluded from property crime estimates due to reporting completeness differences.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'state_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr was not provided.',
      recovery: 'Provide a two-letter state abbreviation when requesting state-level arson data.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No arson data was returned for the requested scope and year range.',
      recovery:
        'Broaden the year range or check the state abbreviation spelling. Arson reporting participation is lower than main UCR series.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state'])
      .describe('Geographic scope: national for US-wide counts, state for a single state.'),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation. Required when scope is "state".'),
    since_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Starting year (inclusive).'),
    until_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Ending year (inclusive).'),
  }),

  output: z.object({
    scope: z.string().describe('Geographic scope of the data.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is state.'),
    records: z
      .array(
        z
          .object({
            year: z.number().optional().describe('Data year.'),
            total_actual: z
              .number()
              .nullable()
              .optional()
              .describe('Total arson offenses reported.'),
            total_cleared: z
              .number()
              .nullable()
              .optional()
              .describe('Total arson offenses cleared.'),
            uninhabited_structures: z
              .number()
              .nullable()
              .optional()
              .describe('Arson in uninhabited structures.'),
            inhabited_structures: z
              .number()
              .nullable()
              .optional()
              .describe('Arson in inhabited structures.'),
            other_structures: z
              .number()
              .nullable()
              .optional()
              .describe('Arson in other structures.'),
            motor_vehicles: z.number().nullable().optional().describe('Motor vehicle arson.'),
            other: z.number().nullable().optional().describe('Other arson categories.'),
          })
          .describe('A single annual arson count row.'),
      )
      .describe('Annual arson count rows.'),
    totalYears: z.number().describe('Number of years returned.'),
    caveat: z
      .string()
      .describe('Methodology caveat — arson is tracked separately from property crime totals.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_arson', { scope: input.scope, state_abbr: input.state_abbr });
    const svc = getFbiApiService();

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('state_required', 'state_abbr is required when scope is "state".', {
        ...ctx.recoveryFor('state_required'),
      });
    }

    const yearParams = {
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };
    const rows =
      input.scope === 'national'
        ? await svc.getArsonNational(yearParams, ctx)
        : // state_abbr is validated above
          await svc.getArsonState(input.state_abbr as string, yearParams, ctx);

    if (rows.length === 0) {
      throw ctx.fail(
        'no_data',
        `No arson data found for scope="${input.scope}"${input.state_abbr ? `, state=${input.state_abbr}` : ''}.`,
        {
          ...ctx.recoveryFor('no_data'),
        },
      );
    }

    ctx.log.info('fbi_get_arson completed', { years: rows.length });
    return {
      scope: input.scope,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      records: rows,
      totalYears: rows.length,
      caveat:
        'Arson is tracked under a separate UCR program with lower participation than the main crime series. Do not combine with property crime estimates — the FBI excludes arson from those totals.',
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const lines: string[] = [
      `## FBI Arson Counts — ${result.scope === 'state' ? (result.state_abbr ?? result.scope) : 'National'}`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}`,
      `**Years returned:** ${result.totalYears}`,
      `\n> **Caveat:** ${result.caveat}`,
      '',
      '| Year | Total Actual | Total Cleared | Inhabited | Uninhabited | Other Structures | Motor Vehicles | Other |',
      '|:-----|:------------|:-------------|:----------|:------------|:----------------|:--------------|:------|',
    ];
    for (const r of result.records) {
      lines.push(
        `| ${r.year ?? '—'} | ${fmt(r.total_actual)} | ${fmt(r.total_cleared)} | ${fmt(r.inhabited_structures)} | ${fmt(r.uninhabited_structures)} | ${fmt(r.other_structures)} | ${fmt(r.motor_vehicles)} | ${fmt(r.other)} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
