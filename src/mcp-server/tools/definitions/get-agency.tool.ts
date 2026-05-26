/**
 * @fileoverview FBI agency profile tool.
 * Fetches a full agency profile by ORI code.
 * @module mcp-server/tools/definitions/get-agency.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const fbiGetAgency = tool('fbi_get_agency', {
  title: 'FBI Get Agency',
  description:
    "Full profile for a single law enforcement agency by ORI code: location, jurisdiction type, population served, NIBRS adoption year, staffing headcount, and UCR participation history. Use to confirm an agency's data coverage before querying offense counts. ORI codes are 9 characters — use fbi_search_agencies to look them up from city or county names.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'agency_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'No agency exists for the provided ORI code.',
      recovery:
        'Use fbi_search_agencies with the city or state to find valid ORI codes for agencies in that area.',
    },
  ],

  input: z.object({
    ori: z
      .string()
      .length(9)
      .describe(
        '9-character ORI (Originating Agency Identifier) code. Use fbi_search_agencies to find ORI codes by state or city.',
      ),
  }),

  output: z.object({
    ori: z.string().optional().describe('9-character ORI code.'),
    agency_name: z.string().optional().describe('Full agency name.'),
    agency_type_name: z
      .string()
      .optional()
      .describe('Jurisdiction type (City, County, Federal, etc.).'),
    state_abbr: z.string().optional().describe('Two-letter state abbreviation.'),
    state_name: z.string().optional().describe('Full state name.'),
    city_name: z.string().optional().describe('City where the agency is located.'),
    county_name: z.string().optional().describe('County where the agency is located.'),
    population: z.number().nullable().optional().describe('Population served by the agency.'),
    population_group_code: z.string().optional().describe('Population group code.'),
    population_group_desc: z
      .string()
      .optional()
      .describe('Human-readable population group description.'),
    nibrs: z
      .boolean()
      .optional()
      .describe('Whether the agency uses NIBRS incident-based reporting.'),
    nibrs_start_date: z
      .string()
      .nullable()
      .optional()
      .describe('Date NIBRS reporting began (ISO 8601). Null if not a NIBRS reporter.'),
    male_officer: z.number().nullable().optional().describe('Count of male sworn officers.'),
    female_officer: z.number().nullable().optional().describe('Count of female sworn officers.'),
    male_civilian: z.number().nullable().optional().describe('Count of male civilian employees.'),
    female_civilian: z
      .number()
      .nullable()
      .optional()
      .describe('Count of female civilian employees.'),
    total_officers: z.number().nullable().optional().describe('Total sworn officer headcount.'),
    total_civilian: z.number().nullable().optional().describe('Total civilian employee headcount.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_agency', { ori: input.ori });
    const svc = getFbiApiService();
    const agency = await svc.getAgency(input.ori, ctx);

    // If the API returns an empty object or missing ORI, treat as not found
    if (!agency || (!agency.ori && !agency.agency_name)) {
      throw ctx.fail('agency_not_found', `No agency found for ORI "${input.ori}".`, {
        ...ctx.recoveryFor('agency_not_found'),
      });
    }

    ctx.log.info('fbi_get_agency completed', { ori: agency.ori, name: agency.agency_name });
    return agency;
  },

  format: (result) => {
    const lines: string[] = [`## Agency Profile: ${result.agency_name ?? result.ori ?? 'Unknown'}`];
    if (result.ori) lines.push(`**ORI:** ${result.ori}`);
    if (result.agency_type_name) lines.push(`**Type:** ${result.agency_type_name}`);
    if (result.state_abbr) lines.push(`**State:** ${result.state_abbr}`);
    const location = [result.city_name, result.county_name, result.state_name]
      .filter(Boolean)
      .join(', ');
    if (location) lines.push(`**Location:** ${location}`);
    if (result.population != null)
      lines.push(`**Population served:** ${result.population.toLocaleString()}`);
    if (result.population_group_code)
      lines.push(`**Population group code:** ${result.population_group_code}`);
    if (result.population_group_desc)
      lines.push(`**Population group:** ${result.population_group_desc}`);
    lines.push('');
    lines.push('### NIBRS Status');
    if (typeof result.nibrs === 'boolean') {
      lines.push(`**NIBRS reporter:** ${result.nibrs ? 'Yes' : 'No'}`);
      if (result.nibrs_start_date) lines.push(`**NIBRS since:** ${result.nibrs_start_date}`);
    } else {
      lines.push('**NIBRS reporter:** Not available');
    }
    const hasStaffing =
      result.total_officers != null ||
      result.total_civilian != null ||
      result.male_civilian != null ||
      result.female_civilian != null;
    if (hasStaffing) {
      lines.push('');
      lines.push('### Staffing');
      if (result.total_officers != null)
        lines.push(`**Total sworn officers:** ${result.total_officers}`);
      if (result.male_officer != null) lines.push(`  - Male officers: ${result.male_officer}`);
      if (result.female_officer != null)
        lines.push(`  - Female officers: ${result.female_officer}`);
      if (result.total_civilian != null)
        lines.push(`**Total civilian employees:** ${result.total_civilian}`);
      if (result.male_civilian != null) lines.push(`  - Male civilian: ${result.male_civilian}`);
      if (result.female_civilian != null)
        lines.push(`  - Female civilian: ${result.female_civilian}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
