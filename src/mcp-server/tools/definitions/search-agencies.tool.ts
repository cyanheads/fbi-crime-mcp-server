/**
 * @fileoverview FBI agency search tool — currently unavailable.
 * The UCR agency search backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * No CDE replacement for agency directory lookup has been identified.
 * @module mcp-server/tools/definitions/search-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiSearchAgencies = tool('fbi_search_agencies', {
  title: 'FBI Search Agencies',
  description:
    '[UNAVAILABLE] The FBI agency search endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For agency ORI codes, consult the FBI CDE website directly at cde.ucr.cjis.gov.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the underlying UCR agency API backend has been decommissioned.',
      recovery:
        'Look up agency ORI codes at cde.ucr.cjis.gov or contact the FBI UCR program. The FBI CDE API migration has removed this endpoint.',
    },
  ],

  input: z.object({
    state_abbr: z
      .string()
      .length(2)
      .optional()
      .describe('State abbreviation (unused — endpoint unavailable).'),
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
      .describe('Agency type (unused).'),
    city: z.string().optional().describe('City name (unused).'),
    population_group: z.string().optional().describe('Population group code (unused).'),
    page: z.number().int().min(1).default(1).describe('Page number (unused).'),
    per_page: z.number().int().min(1).max(100).default(25).describe('Results per page (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI agency search endpoint (UCR /agencies) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Look up agency ORI codes at cde.ucr.cjis.gov or contact the FBI UCR program directly.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI agency search is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
