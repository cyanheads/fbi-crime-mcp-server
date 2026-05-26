/**
 * @fileoverview FBI hate crime incident counts tool.
 * Returns hate crime counts by bias motivation at national or state level.
 * @module mcp-server/tools/definitions/get-hate-crimes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetHateCrimes = tool('fbi_get_hate_crimes', {
  title: 'FBI Get Hate Crimes',
  description:
    'Hate crime incident counts broken down by bias motivation (race/ethnicity, religion, sexual orientation, disability, gender) at national or state level. Use cross_offense=true to additionally show which offense types bias incidents involve. This data is voluntary-report only — participation varies sharply by jurisdiction. Always check fbi_get_participation for context before drawing conclusions, as low participation states may dramatically undercount incidents.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'state_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr was not provided.',
      recovery:
        'Provide a two-letter state abbreviation when requesting state-level hate crime data.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No hate crime data was returned for the requested parameters.',
      recovery:
        'Broaden the year range, check the state abbreviation spelling, or try national scope for baseline comparison.',
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
      .min(1991)
      .max(2030)
      .optional()
      .describe('Starting year (inclusive). Hate crime reporting began in 1991.'),
    until_year: z
      .number()
      .int()
      .min(1991)
      .max(2030)
      .optional()
      .describe('Ending year (inclusive).'),
    cross_offense: z
      .boolean()
      .default(false)
      .describe(
        'Include a cross-tabulation of which offense types bias incidents involve. Returns additional rows with offense_name breakdown.',
      ),
  }),

  output: z.object({
    scope: z.string().describe('Geographic scope of the data.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is state.'),
    incidents: z
      .array(
        z
          .object({
            data_year: z.number().optional().describe('Data year.'),
            bias_motivation: z
              .string()
              .optional()
              .describe(
                'Bias category that motivated the incident (e.g. Anti-Black, Anti-Jewish, Anti-Gay (Male)).',
              ),
            total_individual_incidents: z
              .number()
              .nullable()
              .optional()
              .describe('Number of individual hate crime incidents for this bias type and year.'),
            total_offenses: z
              .number()
              .nullable()
              .optional()
              .describe('Number of offenses within those incidents.'),
            total_victims: z
              .number()
              .nullable()
              .optional()
              .describe('Number of victims across those incidents.'),
            total_known_offenders: z
              .number()
              .nullable()
              .optional()
              .describe('Number of known offenders.'),
            offense_name: z
              .string()
              .optional()
              .describe('Offense type when cross_offense is true.'),
          })
          .describe('A single hate crime incident row.'),
      )
      .describe('Hate crime incident rows by bias motivation and year.'),
    totalRows: z.number().describe('Total rows returned.'),
    cross_offense: z.boolean().describe('Whether the cross-offense breakdown was requested.'),
    caveat: z
      .string()
      .describe('Participation caveat — always present because hate crime reporting is voluntary.'),
    message: z.string().optional().describe('Guidance when no data was returned.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_hate_crimes', { scope: input.scope, state_abbr: input.state_abbr });
    const svc = getFbiApiService();

    if (input.scope === 'state' && !input.state_abbr) {
      throw ctx.fail('state_required', 'state_abbr is required when scope is "state".', {
        ...ctx.recoveryFor('state_required'),
      });
    }

    // Use bias_motivation as variable for the hate crime breakdown
    const variable = input.cross_offense ? 'offense_name' : 'bias_motivation';
    const yearParams = {
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };
    const rows =
      input.scope === 'national'
        ? await svc.getHateCrimesNational(variable, yearParams, ctx)
        : // state_abbr validated above
          await svc.getHateCrimesState(input.state_abbr as string, variable, yearParams, ctx);

    const caveat =
      'Hate crime reporting is voluntary — participation varies significantly by jurisdiction. Low participation jurisdictions may dramatically undercount incidents. Use fbi_get_participation to assess coverage.';

    if (rows.length === 0) {
      return {
        scope: input.scope,
        ...(input.state_abbr && { state_abbr: input.state_abbr }),
        incidents: [],
        totalRows: 0,
        cross_offense: input.cross_offense,
        caveat,
        message: `No hate crime data found for scope=${input.scope}${input.state_abbr ? `, state=${input.state_abbr}` : ''}. The state may have very low participation — check fbi_get_participation.`,
      };
    }

    ctx.log.info('fbi_get_hate_crimes completed', { rows: rows.length });
    return {
      scope: input.scope,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      incidents: rows,
      totalRows: rows.length,
      cross_offense: input.cross_offense,
      caveat,
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const lines: string[] = [
      `## FBI Hate Crime Incidents — ${result.scope === 'state' ? (result.state_abbr ?? result.scope) : 'National'}`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}`,
      `**Rows returned:** ${result.totalRows} | **Cross-offense breakdown:** ${result.cross_offense ? 'Yes' : 'No'}`,
      `\n> **Caveat:** ${result.caveat}`,
    ];
    if (result.message) lines.push(`\n> ${result.message}`);
    if (result.incidents.length > 0) {
      lines.push('');
      if (result.cross_offense) {
        lines.push(
          '| Year | Bias Motivation | Offense Type | Incidents | Offenses | Victims | Known Offenders |',
        );
        lines.push(
          '|:-----|:----------------|:------------|:---------|:---------|:--------|:----------------|',
        );
        for (const r of result.incidents) {
          lines.push(
            `| ${r.data_year ?? '—'} | ${r.bias_motivation ?? '—'} | ${r.offense_name ?? '—'} | ${fmt(r.total_individual_incidents)} | ${fmt(r.total_offenses)} | ${fmt(r.total_victims)} | ${fmt(r.total_known_offenders)} |`,
          );
        }
      } else {
        lines.push('| Year | Bias Motivation | Incidents | Offenses | Victims | Known Offenders |');
        lines.push('|:-----|:----------------|:---------|:---------|:--------|:----------------|');
        for (const r of result.incidents) {
          lines.push(
            `| ${r.data_year ?? '—'} | ${r.bias_motivation ?? '—'} | ${fmt(r.total_individual_incidents)} | ${fmt(r.total_offenses)} | ${fmt(r.total_victims)} | ${fmt(r.total_known_offenders)} |`,
          );
        }
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
