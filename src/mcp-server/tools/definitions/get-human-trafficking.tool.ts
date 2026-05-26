/**
 * @fileoverview FBI human trafficking tool — currently unavailable.
 * The UCR human trafficking backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/tools/definitions/get-human-trafficking.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetHumanTrafficking = tool('fbi_get_human_trafficking', {
  title: 'FBI Get Human Trafficking',
  description:
    '[UNAVAILABLE] The FBI human trafficking endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For human trafficking data, consult the FBI CDE website at cde.ucr.cjis.gov or download bulk data files.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the UCR human trafficking backend has been decommissioned.',
      recovery:
        'The human trafficking endpoint is no longer available. Access this data at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    scope: z.enum(['national', 'state', 'agency']).describe('Scope (unused).'),
    state_abbr: z.string().length(2).optional().describe('State abbreviation (unused).'),
    ori: z.string().length(9).optional().describe('ORI code (unused).'),
    since_year: z.number().int().min(2013).max(2030).optional().describe('Start year (unused).'),
    until_year: z.number().int().min(2013).max(2030).optional().describe('End year (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI human trafficking endpoint (UCR /ht/) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Access human trafficking data at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI human trafficking data is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
