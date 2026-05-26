/**
 * @fileoverview FBI UCR national/state crime estimates tool.
 * Returns FBI-adjusted estimated crime counts by year for violent and property crime.
 * @module mcp-server/tools/definitions/get-crime-estimates.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetCrimeEstimates = tool('fbi_get_crime_estimates', {
  title: 'FBI Get Crime Estimates',
  description:
    '**UCR Summary.** National or state-level estimated crime counts by year, adjusted by the FBI to account for non-reporting agencies. Covers violent crime (murder, rape, robbery, aggravated assault) and property crime (burglary, larceny, motor vehicle theft). Use for top-level trend comparisons across states or years — these are the headline figures the FBI publishes annually. Important: rape is returned as both rape_legacy and rape_revised due to a 2013 definition change; do not sum them. These are FBI estimates, not raw reported counts — see fbi_get_agency_offenses for raw agency data.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'state_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" but state_abbr was not provided.',
      recovery: 'Provide a two-letter state abbreviation when requesting state-level estimates.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No estimate data was returned for the requested scope and year range.',
      recovery: 'Broaden the year range or check the state abbreviation spelling and try again.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state'])
      .describe('Geographic scope: national for US-wide estimates, state for a single state.'),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation (e.g. CA, TX). Required when scope is "state".'),
    since_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Starting year for the data range (inclusive). Defaults to earliest available.'),
    until_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('Ending year for the data range (inclusive). Defaults to most recent available.'),
  }),

  output: z.object({
    scope: z.string().describe('Geographic scope of the data.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is "state".'),
    estimates: z
      .array(
        z
          .object({
            year: z.number().optional().describe('Data year.'),
            population: z
              .number()
              .nullable()
              .optional()
              .describe('Population estimate for this scope and year.'),
            violent_crime: z
              .number()
              .nullable()
              .optional()
              .describe(
                'Estimated total violent crimes (murder + rape + robbery + aggravated assault).',
              ),
            homicide: z
              .number()
              .nullable()
              .optional()
              .describe('Estimated murders and non-negligent manslaughters.'),
            rape_legacy: z
              .number()
              .nullable()
              .optional()
              .describe(
                'Estimated rapes using the pre-2013 legacy definition. Use one rape series consistently for trend analysis.',
              ),
            rape_revised: z
              .number()
              .nullable()
              .optional()
              .describe(
                'Estimated rapes using the post-2013 revised definition. Use one rape series consistently for trend analysis.',
              ),
            robbery: z.number().nullable().optional().describe('Estimated robberies.'),
            aggravated_assault: z
              .number()
              .nullable()
              .optional()
              .describe('Estimated aggravated assaults.'),
            property_crime: z
              .number()
              .nullable()
              .optional()
              .describe(
                'Estimated total property crimes (burglary + larceny + motor vehicle theft).',
              ),
            burglary: z.number().nullable().optional().describe('Estimated burglaries.'),
            larceny: z.number().nullable().optional().describe('Estimated larceny-thefts.'),
            motor_vehicle_theft: z
              .number()
              .nullable()
              .optional()
              .describe('Estimated motor vehicle thefts.'),
          })
          .describe('A single annual crime estimate row.'),
      )
      .describe('Annual crime estimate rows for the requested scope.'),
    totalYears: z.number().describe('Number of years returned.'),
    note: z
      .string()
      .optional()
      .describe('Methodological note about the data, such as the 2013 rape definition change.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_crime_estimates', { scope: input.scope, state_abbr: input.state_abbr });
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
        ? await svc.getEstimatesNational(yearParams, ctx)
        : // state_abbr is validated above
          await svc.getEstimatesState(input.state_abbr as string, yearParams, ctx);

    if (rows.length === 0) {
      throw ctx.fail(
        'no_data',
        `No crime estimate data found for scope="${input.scope}"${input.state_abbr ? `, state=${input.state_abbr}` : ''}.`,
        {
          ...ctx.recoveryFor('no_data'),
        },
      );
    }

    ctx.log.info('fbi_get_crime_estimates completed', { years: rows.length });
    const hasRapeBoth = rows.some(
      (r) => r.rape_legacy !== undefined && r.rape_revised !== undefined,
    );
    return {
      scope: input.scope,
      ...(input.state_abbr && { state_abbr: input.state_abbr }),
      estimates: rows,
      totalYears: rows.length,
      ...(hasRapeBoth && {
        note: 'rape_legacy uses the pre-2013 definition; rape_revised uses the 2013+ definition. Do not sum the two series or compare across the 2013 break without noting the methodology change.',
      }),
    };
  },

  format: (result) => {
    const fmt = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '—');
    const lines: string[] = [
      `## FBI UCR Crime Estimates — ${result.scope === 'state' ? (result.state_abbr ?? result.scope) : 'National'}`,
      `**Scope:** ${result.scope}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}`,
      `**Years returned:** ${result.totalYears}`,
    ];
    if (result.note) lines.push(`\n> **Note:** ${result.note}`);
    lines.push('');
    lines.push(
      '| Year | Population | Violent Crime | Homicide | Rape (Legacy) | Rape (Revised) | Robbery | Agg. Assault | Property Crime | Burglary | Larceny | MV Theft |',
    );
    lines.push(
      '|:-----|:-----------|:-------------|:---------|:-------------|:---------------|:--------|:-------------|:---------------|:---------|:--------|:---------|',
    );
    for (const r of result.estimates) {
      lines.push(
        `| ${r.year ?? '—'} | ${fmt(r.population)} | ${fmt(r.violent_crime)} | ${fmt(r.homicide)} | ${fmt(r.rape_legacy)} | ${fmt(r.rape_revised)} | ${fmt(r.robbery)} | ${fmt(r.aggravated_assault)} | ${fmt(r.property_crime)} | ${fmt(r.burglary)} | ${fmt(r.larceny)} | ${fmt(r.motor_vehicle_theft)} |`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
