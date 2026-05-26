/**
 * @fileoverview FBI UCR agency offense counts tool.
 * Returns raw reported offense counts by agency ORI, state, or county.
 * @module mcp-server/tools/definitions/get-agency-offenses.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetAgencyOffenses = tool('fbi_get_agency_offenses', {
  title: 'FBI Get Agency Offenses',
  description:
    '**UCR Summary.** Offense counts reported by a specific agency (by ORI) or all agencies within a state or county, broken down by offense type and year. Returns raw reported counts — not FBI-adjusted estimates. Use for "what crimes were reported in city X?" or "compare offense counts across agencies in a county." Provide ori for a single agency; provide state_abbr (with optional county_fips) for multi-agency results. FIPS codes for US counties are available via the Census MCP server. Note: agencies that reported fewer than 12 months will have lower counts than full-year reporters — always cross-reference with fbi_get_participation.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'missing_scope',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'Neither ori nor state_abbr was provided.',
      recovery:
        'Provide either ori (9-character ORI code) for a single agency, or state_abbr for all agencies in a state.',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'No offense data was returned for the requested scope.',
      recovery:
        'Verify the ORI code or state abbreviation is correct, broaden the year range, or use fbi_search_agencies to find valid ORI codes.',
    },
  ],

  input: z.object({
    ori: z
      .string()
      .length(9)
      .optional()
      .describe(
        '9-character ORI code for a single agency. Use fbi_search_agencies to find ORI codes.',
      ),
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Two-letter state abbreviation to retrieve all agencies in a state. Used when ori is not provided.',
      ),
    county_fips: z
      .string()
      .optional()
      .describe(
        '5-digit county FIPS code to narrow state results to a single county (e.g. "06037" for Los Angeles County). Requires state_abbr. FIPS codes available from the Census MCP server.',
      ),
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
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe('Page number for state/county scope results (1-indexed).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe('Records per page for state/county scope results.'),
  }),

  output: z.object({
    scope: z
      .string()
      .describe('Whether results are for a single agency ORI or a state/county scope.'),
    ori: z.string().optional().describe('ORI code when scope is single-agency.'),
    state_abbr: z.string().optional().describe('State abbreviation when scope is state or county.'),
    county_fips: z.string().optional().describe('County FIPS when scope is county.'),
    offenses: z
      .array(
        z
          .object({
            ori: z
              .string()
              .optional()
              .describe('ORI code (present in state/county scope to identify which agency).'),
            agency_name: z.string().optional().describe('Agency name (state/county scope).'),
            year: z.number().optional().describe('Data year.'),
            offense: z.string().optional().describe('UCR offense type name.'),
            actual: z
              .number()
              .nullable()
              .optional()
              .describe('Number of offenses reported (actual crimes).'),
            cleared: z
              .number()
              .nullable()
              .optional()
              .describe('Number of offenses cleared by arrest or exceptional means.'),
          })
          .describe('A single offense count row for one agency × year × offense type.'),
      )
      .describe('Offense count rows — one row per agency × year × offense type combination.'),
    totalCount: z
      .number()
      .optional()
      .describe('Total records before pagination (state/county scope).'),
    totalPages: z.number().optional().describe('Total pages available (state/county scope).'),
    message: z
      .string()
      .optional()
      .describe('Guidance when no data was found or to explain data gaps.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_agency_offenses', { ori: input.ori, state_abbr: input.state_abbr });
    const svc = getFbiApiService();

    if (!input.ori && !input.state_abbr) {
      throw ctx.fail('missing_scope', 'Provide either ori or state_abbr.', {
        ...ctx.recoveryFor('missing_scope'),
      });
    }

    const yearParams = {
      ...(input.since_year !== undefined && { since: input.since_year }),
      ...(input.until_year !== undefined && { until: input.until_year }),
    };

    if (input.ori) {
      const rows = await svc.getAgencyOffensesByOri(input.ori, yearParams, ctx);
      if (rows.length === 0) {
        throw ctx.fail('no_data', `No offense data found for ORI "${input.ori}".`, {
          ...ctx.recoveryFor('no_data'),
        });
      }
      ctx.log.info('fbi_get_agency_offenses completed', { scope: 'ori', count: rows.length });
      return { scope: 'agency', ori: input.ori, offenses: rows };
    }

    // state/county scope — state_abbr validated above
    const result = await svc.getAgencyOffensesByState(
      input.state_abbr as string,
      {
        ...yearParams,
        ...(input.county_fips !== undefined && { county_fips: input.county_fips }),
        page: input.page,
        per_page: input.per_page,
      },
      ctx,
    );

    if (result.results.length === 0) {
      return {
        scope: input.county_fips ? 'county' : 'state',
        state_abbr: input.state_abbr,
        ...(input.county_fips && { county_fips: input.county_fips }),
        offenses: [],
        totalCount: 0,
        message: `No offense data found for ${input.county_fips ? `county ${input.county_fips} in` : ''} state "${input.state_abbr}". Verify the state abbreviation or county FIPS code.`,
      };
    }

    ctx.log.info('fbi_get_agency_offenses completed', {
      scope: 'state',
      count: result.results.length,
    });
    return {
      scope: input.county_fips ? 'county' : 'state',
      state_abbr: input.state_abbr,
      ...(input.county_fips && { county_fips: input.county_fips }),
      offenses: result.results,
      ...(result.pagination?.count !== undefined && { totalCount: result.pagination.count }),
      ...(result.pagination?.pages !== undefined && { totalPages: result.pagination.pages }),
    };
  },

  format: (result) => {
    const scopeLabel =
      result.scope === 'agency'
        ? `ORI: ${result.ori ?? '—'}`
        : result.county_fips
          ? `County ${result.county_fips}, ${result.state_abbr}`
          : `State: ${result.state_abbr}`;
    const lines: string[] = [
      `## FBI UCR Agency Offense Counts — ${scopeLabel}`,
      `**Scope:** ${result.scope}${result.ori ? ` | **ORI:** ${result.ori}` : ''}${result.state_abbr ? ` | **State:** ${result.state_abbr}` : ''}`,
    ];
    if (result.totalCount !== undefined) {
      lines.push(
        `**Total records:** ${result.totalCount}${result.totalPages !== undefined ? ` (${result.totalPages} pages)` : ''}`,
      );
    }
    if (result.message) lines.push(`\n> ${result.message}`);
    if (result.offenses.length > 0) {
      lines.push('');
      const hasAgency = result.offenses.some((o) => o.ori ?? o.agency_name);
      if (hasAgency) {
        lines.push('| ORI | Agency | Year | Offense | Actual | Cleared |');
        lines.push('|:----|:-------|:-----|:--------|:-------|:--------|');
        for (const o of result.offenses) {
          lines.push(
            `| ${o.ori ?? '—'} | ${o.agency_name ?? '—'} | ${o.year ?? '—'} | ${o.offense ?? '—'} | ${o.actual != null ? o.actual.toLocaleString() : '—'} | ${o.cleared != null ? o.cleared.toLocaleString() : '—'} |`,
          );
        }
      } else {
        lines.push('| Year | Offense | Actual | Cleared |');
        lines.push('|:-----|:--------|:-------|:--------|');
        for (const o of result.offenses) {
          lines.push(
            `| ${o.year ?? '—'} | ${o.offense ?? '—'} | ${o.actual != null ? o.actual.toLocaleString() : '—'} | ${o.cleared != null ? o.cleared.toLocaleString() : '—'} |`,
          );
        }
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
