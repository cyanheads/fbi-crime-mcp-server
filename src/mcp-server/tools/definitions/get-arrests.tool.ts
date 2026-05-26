/**
 * @fileoverview FBI arrests tool — currently unavailable.
 * The UCR arrests backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/tools/definitions/get-arrests.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetArrests = tool('fbi_get_arrests', {
  title: 'FBI Get Arrests',
  description:
    '[UNAVAILABLE] The FBI arrests endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For arrest data, consult the FBI CDE website at cde.ucr.cjis.gov or download bulk data files.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the UCR arrests backend has been decommissioned.',
      recovery:
        'The arrests endpoint is no longer available. Access arrest data at cde.ucr.cjis.gov or download bulk CSV files from the FBI.',
    },
  ],

  input: z.object({
    since_year: z.number().int().min(1960).max(2030).optional().describe('Start year (unused).'),
    until_year: z.number().int().min(1960).max(2030).optional().describe('End year (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI arrests endpoint (UCR /arrests/national) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Access arrest data at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI arrests data is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
