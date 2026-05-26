/**
 * @fileoverview FBI agency profile resource.
 * Returns full agency profile for a given ORI code.
 * @module mcp-server/resources/definitions/agency.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { notFound } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const agencyResource = resource('fbi://agency/{ori}', {
  name: 'fbi-agency-profile',
  description:
    'Full agency profile for a given ORI — jurisdiction, type, population, NIBRS adoption year, staffing, and reporting history. Useful for attaching static agency context to a multi-step workflow without re-fetching.',
  mimeType: 'application/json',
  params: z.object({
    ori: z.string().describe('9-character ORI (Originating Agency Identifier) code.'),
  }),
  output: z.object({
    ori: z.string().optional().describe('9-character ORI code.'),
    agency_name: z.string().optional().describe('Full agency name.'),
    agency_type_name: z.string().optional().describe('Jurisdiction type.'),
    state_abbr: z.string().optional().describe('Two-letter state abbreviation.'),
    state_name: z.string().optional().describe('Full state name.'),
    city_name: z.string().optional().describe('City.'),
    county_name: z.string().optional().describe('County.'),
    population: z.number().nullable().optional().describe('Population served.'),
    population_group_desc: z.string().optional().describe('Population group description.'),
    nibrs: z.boolean().optional().describe('Whether agency uses NIBRS reporting.'),
    nibrs_start_date: z.string().nullable().optional().describe('NIBRS start date.'),
    total_officers: z.number().nullable().optional().describe('Total sworn officers.'),
    total_civilian: z.number().nullable().optional().describe('Total civilian employees.'),
  }),

  async handler(params, ctx) {
    const svc = getFbiApiService();
    ctx.log.debug('fbi://agency resource', { ori: params.ori });
    const agency = await svc.getAgency(params.ori, ctx);

    if (!agency || (!agency.ori && !agency.agency_name)) {
      throw notFound(
        `No agency found for ORI "${params.ori}". Use fbi_search_agencies to find valid ORI codes.`,
      );
    }

    return agency;
  },
});
