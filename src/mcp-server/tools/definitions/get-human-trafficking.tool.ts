/**
 * @fileoverview FBI human trafficking offense and clearance counts tool.
 * Returns counts at national, state, or agency level.
 * @module mcp-server/tools/definitions/get-human-trafficking.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';
export const fbiGetHumanTrafficking = tool('fbi_get_human_trafficking', {
  title: 'FBI Get Human Trafficking',
  description:
    'Human trafficking offense and clearance counts (commercial sex acts, involuntary servitude) at national, state, or agency level. Reported under a separate UCR collection track; coverage is sparser than the main UCR series. Scope "agency" requires an ORI code — use fbi_search_agencies to find ORI codes.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'scope_requirements',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr when scope is "state", or ori when scope is "agency". Use fbi_search_agencies to find ORI codes.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No human trafficking data was returned for the requested parameters.',
      recovery:
        'Human trafficking reporting is sparse — try national scope, broaden the year range, or verify the ORI/state abbreviation.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe(
        'Data scope: national, state, or agency. Agency scope returns data for a single ORI.',
      ),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation. Required when scope is "state".'),
    ori: z
      .string()
      .length(9)
      .optional()
      .describe('9-character ORI code. Required when scope is "agency".'),
    since_year: z
      .number()
      .int()
      .min(2013)
      .max(2030)
      .optional()
      .describe('Starting year (inclusive). Human trafficking reporting began 2013.'),
    until_year: z
      .number()
      .int()
      .min(2013)
      .max(2030)
      .optional()
      .describe('Ending year (inclusive).'),
  }),

  output: z.object({
    scope: z.string().describe('Data scope requested.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is state.'),
    ori: z.string().optional().describe('ORI code when scope is agency.'),
    records: z
      .array(
        z
          .object({
            data_year: z.number().optional().describe('Data year.'),
            state_abbr: z.string().optional().describe('State (in national/state results).'),
            ori: z.string().optional().describe('ORI code (in agency results).'),
            agency_name: z.string().optional().describe('Agency name (in agency results).'),
            actual_commercial_sex_acts: z
              .number()
              .nullable()
              .optional()
              .describe('Reported commercial sex act offenses.'),
            actual_involuntary_servitude: z
              .number()
              .nullable()
              .optional()
              .describe('Reported involuntary servitude offenses.'),
            cleared_commercial_sex_acts: z
              .number()
              .nullable()
              .optional()
              .describe('Commercial sex act offenses cleared.'),
            cleared_involuntary_servitude: z
              .number()
              .nullable()
              .optional()
              .describe('Involuntary servitude offenses cleared.'),
          })
          .describe('A single human trafficking record with offense and clearance counts.'),
      )
      .describe('Human trafficking records with offense and clearance counts.'),
    totalRows: z.number().describe('Total rows returned.'),
    caveat: z
      .string()
      .describe('Coverage caveat — human trafficking is a separate track with sparser reporting.'),
    message: z.string().optional().describe('Guidance when no data was returned.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_human_trafficking', { scope: input.scope });
    const svc = getFbiApiService();

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('scope_requirements', 'state_abbr required for scope="state".', {
        ...ctx.recoveryFor('scope_requirements'),
      });
    }
    if (input.scope === 'agency' && !input.ori) {
      throw ctx.fail('scope_requirements', 'ori required for scope="agency".', {
        ...ctx.recoveryFor('scope_requirements'),
      });
    }

    const caveat =
      'Human trafficking reporting is a separate UCR collection track with sparser participation than the main crime series. Figures likely undercount actual prevalence.';

    const yearParams = {
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };
    const rows =
      input.scope === 'national'
        ? await svc.getHumanTraffickingNational(yearParams, ctx)
        : input.scope === 'state'
          ? // state_abbr is validated above
            await svc.getHumanTraffickingState(input.state_abbr as string, yearParams, ctx)
          : // ori is validated above
            await svc.getHumanTraffickingByAgency(input.ori as string, yearParams, ctx);

    if (rows.length === 0) {
      return {
        scope: input.scope,
        ...(input.state_abbr && { state_abbr: input.state_abbr }),
        ...(input.ori && { ori: input.ori }),
        records: [],
        totalRows: 0,
        caveat,
        message: `No human trafficking data found for scope=${input.scope}. This track has sparse coverage — try national scope or broaden the year range.`,
      };
    }

    ctx.log.info('fbi_get_human_trafficking completed', { rows: rows.length });
    return {
      scope: input.scope,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      ...(input.ori && { ori: input.ori }),
      records: rows,
      totalRows: rows.length,
      caveat,
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const scopeLabel =
      result.scope === 'state'
        ? (result.state_abbr ?? result.scope)
        : result.scope === 'agency'
          ? `ORI: ${result.ori ?? '—'}`
          : 'National';
    const lines: string[] = [
      `## FBI Human Trafficking — ${scopeLabel}`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}${result.ori ? ` | **ORI:** ${result.ori}` : ''}`,
      `**Rows returned:** ${result.totalRows}`,
      `\n> **Caveat:** ${result.caveat}`,
    ];
    if (result.message) lines.push(`\n> ${result.message}`);
    if (result.records.length > 0) {
      lines.push('');
      lines.push(
        '| Year | State | ORI | Agency | Commercial Sex Acts | Involuntary Servitude | CSA Cleared | IS Cleared |',
      );
      lines.push(
        '|:-----|:------|:----|:-------|:-------------------|:---------------------|:-----------|:-----------|',
      );
      for (const r of result.records) {
        lines.push(
          `| ${r.data_year ?? '—'} | ${r.state_abbr ?? '—'} | ${r.ori ?? '—'} | ${r.agency_name ?? '—'} | ${fmt(r.actual_commercial_sex_acts)} | ${fmt(r.actual_involuntary_servitude)} | ${fmt(r.cleared_commercial_sex_acts)} | ${fmt(r.cleared_involuntary_servitude)} |`,
        );
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
