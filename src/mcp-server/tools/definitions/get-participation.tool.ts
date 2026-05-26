/**
 * @fileoverview FBI UCR/NIBRS reporting participation tool.
 * Returns how many agencies submitted data, months reported, NIBRS adoption, and population coverage.
 * @module mcp-server/tools/definitions/get-participation.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetParticipation = tool('fbi_get_participation', {
  title: 'FBI Get Participation',
  description:
    'UCR and NIBRS reporting participation rates. Returns how many agencies submitted data, months of data reported, NIBRS vs. SRS adoption rates, and share of population covered. Always call this alongside any crime count to establish data reliability — a count from an agency that reported 3 of 12 months is not comparable to a full-year reporter. Scope options: national (overall US rates), state (summary for a single state), or agency (list of individual agencies with per-agency participation, optionally filtered to NIBRS-only reporters).',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'state_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'scope is "state" or "agency" but state_abbr was not provided.',
      recovery: 'Provide a two-letter state abbreviation when scope is "state" or "agency".',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No participation data was returned for the requested scope and filters.',
      recovery: 'Try a different year or check the state abbreviation spelling and try again.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe(
        'Participation scope: national for US totals, state for a single state summary, agency for per-agency list.',
      ),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('Two-letter state abbreviation. Required when scope is "state" or "agency".'),
    year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe(
        'Year to retrieve participation data for. Defaults to the most recent available year.',
      ),
    nibrs_only: z
      .boolean()
      .optional()
      .describe(
        'When scope is "agency", filter to only NIBRS-reporting agencies. Ignored for other scopes.',
      ),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe('Page number for agency-scope results (1-indexed).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe('Number of agency records per page when scope is "agency".'),
  }),

  output: z.object({
    scope: z.string().describe('The requested participation scope.'),
    year: z.number().optional().describe('The data year returned, when available.'),
    // National/state summary fields
    agency_count: z
      .number()
      .nullable()
      .optional()
      .describe('Total number of agencies in the scope.'),
    months_reported: z
      .number()
      .nullable()
      .optional()
      .describe('Average months of data submitted across agencies.'),
    nibrs_participating: z
      .number()
      .nullable()
      .optional()
      .describe('Number of agencies reporting via NIBRS.'),
    total_population: z.number().nullable().optional().describe('Total population in scope.'),
    covered_population: z
      .number()
      .nullable()
      .optional()
      .describe('Population covered by reporting agencies.'),
    // Agency-level list
    agencies: z
      .array(
        z
          .object({
            ori: z.string().optional().describe('9-character ORI code.'),
            agency_name: z.string().optional().describe('Full agency name.'),
            state_abbr: z.string().optional().describe('Two-letter state abbreviation.'),
            months_reported: z
              .number()
              .nullable()
              .optional()
              .describe('Months of data submitted (0–12). Full coverage = 12.'),
            nibrs: z.boolean().optional().describe('Whether the agency uses NIBRS reporting.'),
            nibrs_start_date: z
              .string()
              .nullable()
              .optional()
              .describe('Date NIBRS reporting began, if applicable.'),
          })
          .describe('A single agency participation row.'),
      )
      .optional()
      .describe('Per-agency participation records when scope is "agency".'),
    totalCount: z
      .number()
      .optional()
      .describe('Total agencies in agency-scope results before pagination.'),
    totalPages: z.number().optional().describe('Total pages available for agency-scope results.'),
    message: z
      .string()
      .optional()
      .describe('Guidance when no data was found or when interpreting sparse coverage.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_participation', { scope: input.scope, state_abbr: input.state_abbr });
    const svc = getFbiApiService();

    if ((input.scope === 'state' || input.scope === 'agency') && !input.state_abbr) {
      throw ctx.fail('state_required', `scope="${input.scope}" requires state_abbr.`, {
        ...ctx.recoveryFor('state_required'),
      });
    }

    const yearParam = input.year !== undefined ? { year: input.year } : {};

    if (input.scope === 'national') {
      const rows = await svc.getCdeParticipationNational(yearParam, ctx);
      if (rows.length === 0) {
        throw ctx.fail('no_data', 'No national participation data found.', {
          ...ctx.recoveryFor('no_data'),
        });
      }
      return { scope: 'national', ...rows[0] };
    }

    if (input.scope === 'state') {
      // state_abbr validated above
      const rows = await svc.getCdeParticipationState(input.state_abbr as string, yearParam, ctx);
      if (rows.length === 0) {
        throw ctx.fail('no_data', `No participation data found for state "${input.state_abbr}".`, {
          ...ctx.recoveryFor('no_data'),
        });
      }
      return { scope: 'state', ...rows[0] };
    }

    // scope === 'agency'
    const result = await svc.getCdeParticipationAgencies(
      {
        ...(input.state_abbr !== undefined && { state_abbr: input.state_abbr }),
        ...(input.year !== undefined && { year: input.year }),
        ...(input.nibrs_only !== undefined && { nibrs_only: input.nibrs_only }),
        page: input.page,
        per_page: input.per_page,
      },
      ctx,
    );

    if (result.results.length === 0) {
      return {
        scope: 'agency',
        agencies: [],
        totalCount: 0,
        message: `No agency participation data found for state "${input.state_abbr}"${input.nibrs_only ? ' (NIBRS-only filter applied)' : ''}. Try a different year or remove the nibrs_only filter.`,
      };
    }

    ctx.log.info('fbi_get_participation completed', { count: result.results.length });
    return {
      scope: 'agency',
      agencies: result.results,
      ...(result.pagination?.count !== undefined && { totalCount: result.pagination.count }),
      ...(result.pagination?.pages !== undefined && { totalPages: result.pagination.pages }),
    };
  },

  format: (result) => {
    const lines: string[] = [
      `## FBI UCR/NIBRS Participation — ${result.scope.charAt(0).toUpperCase() + result.scope.slice(1)}`,
    ];
    if (result.year) lines.push(`**Year:** ${result.year}`);
    if (result.agency_count != null)
      lines.push(`**Reporting agencies:** ${result.agency_count.toLocaleString()}`);
    if (result.months_reported != null)
      lines.push(`**Avg months reported:** ${result.months_reported}`);
    if (result.nibrs_participating != null)
      lines.push(`**NIBRS-reporting agencies:** ${result.nibrs_participating.toLocaleString()}`);
    if (result.total_population != null)
      lines.push(`**Total population in scope:** ${result.total_population.toLocaleString()}`);
    if (result.covered_population != null)
      lines.push(
        `**Population covered by reporters:** ${result.covered_population.toLocaleString()}`,
      );
    if (result.message) lines.push(`\n> ${result.message}`);
    if (result.agencies?.length) {
      lines.push('');
      lines.push(
        `### Agency Participation (${result.agencies.length} shown${result.totalCount !== undefined ? ` of ${result.totalCount}` : ''})`,
      );
      lines.push('| ORI | Agency | State | Months Reported | NIBRS |');
      lines.push('|:----|:-------|:------|:----------------|:------|');
      for (const a of result.agencies) {
        const ori = a.ori ?? '—';
        const name = a.agency_name ?? '—';
        const state = a.state_abbr ?? '—';
        const months = a.months_reported != null ? String(a.months_reported) : '—';
        const nibrs =
          typeof a.nibrs === 'boolean'
            ? a.nibrs
              ? `Yes${a.nibrs_start_date ? ` (${a.nibrs_start_date})` : ''}`
              : 'No'
            : '—';
        lines.push(`| ${ori} | ${name} | ${state} | ${months} | ${nibrs} |`);
      }
      if (result.totalPages !== undefined && result.totalPages > 1) {
        lines.push(`\n*Page 1 of ${result.totalPages} — use page parameter to paginate.*`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
