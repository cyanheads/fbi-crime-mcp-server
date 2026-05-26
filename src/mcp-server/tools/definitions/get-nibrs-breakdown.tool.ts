/**
 * @fileoverview FBI NIBRS incident breakdown tool.
 * Counts incident-level NIBRS records broken down by demographic or attribute variable.
 * @module mcp-server/tools/definitions/get-nibrs-breakdown.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

// Variable sets per dimension from the design doc
const OFFENDER_VARIABLES = [
  'ethnicity',
  'race_code',
  'sex_code',
  'age_num',
  'offense_name',
  'location_name',
  'prop_desc_name',
] as const;
const VICTIM_VARIABLES = [
  'ethnicity',
  'race_code',
  'sex_code',
  'age_num',
  'offense_name',
  'location_name',
  'prop_desc_name',
  'offender_relationship',
  'resident_status_code',
  'circumstance_name',
] as const;
const OFFENSE_VARIABLES = [
  'offense_name',
  'weapon_name',
  'location_name',
  'method_entry_code',
  'num_premises_entered',
] as const;

const ALL_VARIABLES = [
  ...new Set([...OFFENDER_VARIABLES, ...VICTIM_VARIABLES, ...OFFENSE_VARIABLES]),
] as const;

export const fbiGetNibrsBreakdown = tool('fbi_get_nibrs_breakdown', {
  title: 'FBI Get NIBRS Breakdown',
  description:
    '**NIBRS only.** Count incident-level NIBRS records broken down by a demographic or attribute variable — nationally or for a specific state. dimension selects what is being counted (offenders, victims, or offenses). variable selects the grouping (race, sex, age, location type, weapon, offense name, etc.). Optionally filter to a single offense category. Coverage is limited to NIBRS-reporting agencies; check fbi_get_participation to understand geographic gaps before drawing conclusions. Valid variables by dimension: offenders — ethnicity, race_code, sex_code, age_num, offense_name, location_name, prop_desc_name; victims — all offender variables plus offender_relationship, resident_status_code, circumstance_name; offenses — offense_name, weapon_name, location_name, method_entry_code, num_premises_entered.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'state_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr was not provided.',
      recovery: 'Provide a two-letter state abbreviation when requesting state-level NIBRS data.',
    },
    {
      reason: 'invalid_variable',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'The variable is not valid for the selected dimension.',
      recovery:
        'Check the tool description for valid variable names per dimension, or use fbi_list_code_table to find valid offense names and other codes.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No NIBRS data returned for the requested parameters.',
      recovery:
        'Try a broader year range, check that the state has NIBRS agencies via fbi_get_participation, or verify the offense_name using fbi_list_code_table with table=offenses.',
    },
  ],

  input: z.object({
    dimension: z
      .enum(['offenders', 'victims', 'offenses'])
      .describe('What is being counted: offenders, victims, or offenses.'),
    variable: z
      .enum(ALL_VARIABLES)
      .describe(
        'Grouping variable. Valid values depend on dimension — see tool description for the full list per dimension.',
      ),
    scope: z
      .enum(['national', 'state'])
      .describe('Geographic scope: national for US-wide counts, state for a single state.'),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation. Required when scope is "state".'),
    offense_name: z
      .string()
      .optional()
      .describe(
        'Filter results to a specific NIBRS offense. Use fbi_list_code_table with table=offenses to find valid offense names.',
      ),
    since_year: z
      .number()
      .int()
      .min(1985)
      .max(2030)
      .optional()
      .describe(
        'Starting year (inclusive). NIBRS data availability varies by agency adoption year.',
      ),
    until_year: z
      .number()
      .int()
      .min(1985)
      .max(2030)
      .optional()
      .describe('Ending year (inclusive).'),
  }),

  output: z.object({
    dimension: z.string().describe('The counted dimension (offenders, victims, or offenses).'),
    variable: z.string().describe('The grouping variable used.'),
    scope: z.string().describe('Geographic scope.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is state.'),
    offense_name: z.string().optional().describe('Offense filter applied, if any.'),
    breakdown: z
      .array(
        z
          .object({
            key: z
              .string()
              .optional()
              .describe('Group value (e.g. race category name, age bracket, offense name).'),
            value: z.number().nullable().optional().describe('Count for this group.'),
            total: z
              .number()
              .nullable()
              .optional()
              .describe('Total across all groups for context.'),
          })
          .describe('A single breakdown row with group value and count.'),
      )
      .describe('Breakdown rows — one per group value with count.'),
    totalRows: z.number().describe('Number of groups returned.'),
    caveat: z
      .string()
      .describe(
        'NIBRS coverage caveat — always present because NIBRS does not cover all agencies.',
      ),
    message: z
      .string()
      .optional()
      .describe('Guidance when no data was returned — suggests alternative parameters.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_nibrs_breakdown', {
      dimension: input.dimension,
      variable: input.variable,
      scope: input.scope,
    });
    const svc = getFbiApiService();

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('state_required', 'state_abbr is required when scope is "state".', {
        ...ctx.recoveryFor('state_required'),
      });
    }

    // Validate variable for dimension
    const valid: Record<string, readonly string[]> = {
      offenders: OFFENDER_VARIABLES,
      victims: VICTIM_VARIABLES,
      offenses: OFFENSE_VARIABLES,
    };
    const validForDimension = valid[input.dimension];
    if (!validForDimension?.includes(input.variable)) {
      throw ctx.fail(
        'invalid_variable',
        `Variable "${input.variable}" is not valid for dimension "${input.dimension}". Valid: ${(validForDimension ?? []).join(', ')}.`,
        { ...ctx.recoveryFor('invalid_variable') },
      );
    }

    const nibrsParams = {
      ...(input.state_abbr !== undefined && { state_abbr: input.state_abbr }),
      ...(input.offense_name !== undefined && { offense_name: input.offense_name }),
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };
    const rows = await svc.getNibrsBreakdown(
      input.dimension,
      input.variable,
      input.scope,
      nibrsParams,
      ctx,
    );

    const caveat =
      'NIBRS data only includes incident-level records from NIBRS-reporting agencies. Coverage varies by state and year — use fbi_get_participation to assess completeness before drawing conclusions.';

    if (rows.length === 0) {
      return {
        dimension: input.dimension,
        variable: input.variable,
        scope: input.scope,
        ...(input.state_abbr && { state_abbr: input.state_abbr }),
        ...(input.offense_name && { offense_name: input.offense_name }),
        breakdown: [],
        totalRows: 0,
        caveat,
        message: `No NIBRS data found for dimension=${input.dimension}, variable=${input.variable}${input.offense_name ? `, offense=${input.offense_name}` : ''}. Check fbi_get_participation for state NIBRS coverage, or verify offense name with fbi_list_code_table table=offenses.`,
      };
    }

    ctx.log.info('fbi_get_nibrs_breakdown completed', { rows: rows.length });
    return {
      dimension: input.dimension,
      variable: input.variable,
      scope: input.scope,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      ...(input.offense_name && { offense_name: input.offense_name }),
      breakdown: rows,
      totalRows: rows.length,
      caveat,
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const scopeLabel =
      result.scope === 'state' ? `${result.state_abbr ?? result.scope}` : 'National';
    const lines: string[] = [
      `## FBI NIBRS Breakdown — ${result.dimension} by ${result.variable}`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}${result.offense_name ? ` | **Offense filter:** ${result.offense_name}` : ''} | **Geography:** ${scopeLabel}`,
      `**Groups returned:** ${result.totalRows}`,
      `\n> **Caveat:** ${result.caveat}`,
    ];
    if (result.message) lines.push(`\n> ${result.message}`);
    if (result.breakdown.length > 0) {
      lines.push('');
      lines.push('| Group | Count | Total |');
      lines.push('|:------|------:|------:|');
      for (const row of result.breakdown) {
        lines.push(`| ${row.key ?? '—'} | ${fmt(row.value)} | ${fmt(row.total)} |`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
