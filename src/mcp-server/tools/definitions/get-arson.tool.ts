/**
 * @fileoverview FBI arson tool — UCR endpoint decommissioned; use fbi_get_crime_estimates.
 * The UCR arson-specific backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * Arson data IS available via fbi_get_crime_estimates with offense="arson".
 * @module mcp-server/tools/definitions/get-arson.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetArson = tool('fbi_get_arson', {
  title: 'FBI Get Arson',
  description:
    '[UNAVAILABLE — use fbi_get_crime_estimates] The dedicated UCR arson endpoint has been decommissioned. However, arson data IS available via fbi_get_crime_estimates with offense="arson" and scope="national" or scope="state". That endpoint returns monthly rates and counts from the CDE summarized API.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the dedicated UCR arson endpoint has been decommissioned.',
      recovery:
        'Use fbi_get_crime_estimates with offense="arson" to get arson rates and counts from the CDE summarized endpoint.',
    },
  ],

  input: z.object({
    scope: z
      .enum(['national', 'state'])
      .describe('Scope (unused — use fbi_get_crime_estimates instead).'),
    state_abbr: z.string().length(2).optional().describe('State abbreviation (unused).'),
    since_year: z.number().int().min(1960).max(2030).optional().describe('Start year (unused).'),
    until_year: z.number().int().min(1960).max(2030).optional().describe('End year (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The dedicated arson endpoint (UCR /arson/) has been decommissioned. Use fbi_get_crime_estimates with offense="arson" to get arson data via the CDE summarized API.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI dedicated arson endpoint is unavailable.** Use `fbi_get_crime_estimates` with `offense="arson"` to access arson data via the CDE summarized API.',
    },
  ],
});
