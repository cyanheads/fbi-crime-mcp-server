/**
 * @fileoverview FBI hate crimes tool — currently unavailable.
 * The UCR hate crime backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/tools/definitions/get-hate-crimes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetHateCrimes = tool('fbi_get_hate_crimes', {
  title: 'FBI Get Hate Crimes',
  description:
    '[UNAVAILABLE] The FBI hate crimes endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For hate crime data, consult the FBI CDE website at cde.ucr.cjis.gov or download bulk data files.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the UCR hate crimes backend has been decommissioned.',
      recovery:
        'The hate crimes endpoint is no longer available. Access hate crime data at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    scope: z.enum(['national', 'state']).describe('Scope (unused).'),
    state_abbr: z.string().length(2).optional().describe('State abbreviation (unused).'),
    since_year: z.number().int().min(1991).max(2030).optional().describe('Start year (unused).'),
    until_year: z.number().int().min(1991).max(2030).optional().describe('End year (unused).'),
    cross_offense: z.boolean().default(false).describe('Cross-offense breakdown (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI hate crimes endpoint (UCR /hc/count/) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Access hate crime data at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI hate crimes data is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
