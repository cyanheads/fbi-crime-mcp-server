/**
 * @fileoverview FBI agency search tool.
 * Searches law enforcement agencies by state, city, type, or population group.
 * @module mcp-server/tools/definitions/search-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiSearchAgencies = tool('fbi_search_agencies', {
  title: 'FBI Search Agencies',
  description:
    'Search law enforcement agencies by state, city, type, or population group. Returns ORI codes — the identifier required for all agency-scoped queries. Use this tool before fbi_get_agency_offenses or fbi_get_participation when you have a city or county name but not an ORI code. Filter by agency_type to narrow to city police, county sheriffs, federal agencies, university police, or tribal law enforcement.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'no_agencies_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'No agencies matched the search criteria.',
      recovery:
        'Broaden the search by removing filters, checking state abbreviation spelling, or trying a different city name.',
    },
  ],

  input: z.object({
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Two-letter US state abbreviation (e.g. CA, TX, NY). Highly recommended — most agency searches are state-scoped.',
      ),
    agency_type: z
      .enum([
        'City',
        'County',
        'Federal',
        'State Police',
        'University or College',
        'Tribal',
        'Other',
      ])
      .optional()
      .describe('Agency jurisdiction type. City for municipal police, County for sheriffs, etc.'),
    city: z
      .string()
      .optional()
      .describe('City name filter. Partial matches may work depending on the API.'),
    population_group: z
      .string()
      .optional()
      .describe(
        'Population group code (e.g. 1A, 2, 6). Use fbi_list_code_table with table=population_group to see valid codes and their population ranges.',
      ),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe('Page number for paginated results (1-indexed).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe('Number of agencies per page (max 100).'),
  }),

  output: z.object({
    agencies: z
      .array(
        z
          .object({
            ori: z
              .string()
              .optional()
              .describe('9-character ORI code — the agency identifier for all FBI API queries.'),
            agency_name: z.string().optional().describe('Full agency name.'),
            agency_type_name: z
              .string()
              .optional()
              .describe('Jurisdiction type (City, County, Federal, etc.).'),
            state_abbr: z.string().optional().describe('Two-letter state abbreviation.'),
            state_name: z.string().optional().describe('Full state name.'),
            city_name: z.string().optional().describe('City where the agency is located.'),
            county_name: z.string().optional().describe('County where the agency is located.'),
            nibrs: z
              .boolean()
              .optional()
              .describe('Whether the agency reports via NIBRS incident-based reporting.'),
            nibrs_start_date: z
              .string()
              .nullable()
              .optional()
              .describe('Date the agency began NIBRS reporting, if applicable.'),
            population: z
              .number()
              .nullable()
              .optional()
              .describe('Population served by the agency.'),
            population_group_code: z
              .string()
              .optional()
              .describe('Population group code for the agency size classification.'),
            population_group_desc: z
              .string()
              .optional()
              .describe('Human-readable population group description.'),
          })
          .describe('A single agency search result with ORI code and profile details.'),
      )
      .describe('Matching agencies with ORI codes and profile details.'),
    totalCount: z
      .number()
      .optional()
      .describe('Total number of agencies matching the query (before pagination).'),
    page: z.number().optional().describe('Current page number returned.'),
    totalPages: z.number().optional().describe('Total number of pages available.'),
    message: z
      .string()
      .optional()
      .describe('Recovery hint when no agencies were found — suggests how to broaden filters.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_search_agencies', {
      state_abbr: input.state_abbr,
      agency_type: input.agency_type,
    });
    const svc = getFbiApiService();
    const result = await svc.searchAgencies(
      {
        ...(input.state_abbr !== undefined && { state_abbr: input.state_abbr }),
        ...(input.agency_type !== undefined && { agency_type: input.agency_type }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.population_group !== undefined && { population_group: input.population_group }),
        page: input.page,
        per_page: input.per_page,
      },
      ctx,
    );

    const agencies = result.results;

    if (agencies.length === 0) {
      const filters = [
        input.state_abbr && `state=${input.state_abbr}`,
        input.agency_type && `type=${input.agency_type}`,
        input.city && `city=${input.city}`,
      ]
        .filter(Boolean)
        .join(', ');
      return {
        agencies: [],
        totalCount: 0,
        message: `No agencies found${filters ? ` matching ${filters}` : ''}. Try removing filters or checking the state abbreviation spelling.`,
      };
    }

    ctx.log.info('fbi_search_agencies completed', { count: agencies.length });
    return {
      agencies,
      ...(result.pagination?.count !== undefined && { totalCount: result.pagination.count }),
      ...(result.pagination?.page !== undefined && { page: result.pagination.page }),
      ...(result.pagination?.pages !== undefined && { totalPages: result.pagination.pages }),
    };
  },

  format: (result) => {
    const lines: string[] = ['## FBI Agency Search Results'];
    if (result.totalCount !== undefined) {
      lines.push(
        `**Total matching:** ${result.totalCount}${result.totalPages !== undefined ? ` (page ${result.page ?? 1} of ${result.totalPages})` : ''}`,
      );
    }
    if (result.message) lines.push(`\n> ${result.message}`);
    lines.push('');
    for (const a of result.agencies) {
      lines.push(`### ${a.agency_name ?? a.ori ?? 'Unknown Agency'}`);
      if (a.ori) lines.push(`**ORI:** ${a.ori}`);
      if (a.agency_type_name) lines.push(`**Type:** ${a.agency_type_name}`);
      if (a.state_abbr) lines.push(`**State:** ${a.state_abbr}`);
      const location = [a.city_name, a.county_name, a.state_name].filter(Boolean).join(', ');
      if (location) lines.push(`**Location:** ${location}`);
      if (a.population != null)
        lines.push(`**Population served:** ${a.population.toLocaleString()}`);
      if (a.population_group_code)
        lines.push(`**Population group code:** ${a.population_group_code}`);
      if (a.population_group_desc) lines.push(`**Population group:** ${a.population_group_desc}`);
      if (typeof a.nibrs === 'boolean')
        lines.push(
          `**NIBRS reporting:** ${a.nibrs ? `Yes${a.nibrs_start_date ? ` (since ${a.nibrs_start_date})` : ''}` : 'No'}`,
        );
      lines.push('');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
