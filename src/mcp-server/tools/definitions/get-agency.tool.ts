/**
 * @fileoverview FBI agency profile tool — currently unavailable.
 * The UCR agency profile backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * No CDE replacement for individual agency lookup by ORI has been identified.
 * @module mcp-server/tools/definitions/get-agency.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetAgency = tool('fbi_get_agency', {
  title: 'FBI Get Agency',
  description:
    '[UNAVAILABLE] The FBI agency profile endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For agency details, consult the FBI CDE website at cde.ucr.cjis.gov.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the underlying UCR agency profile API backend has been decommissioned.',
      recovery:
        'The FBI agency profile endpoint is no longer available. Look up agency details at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    ori: z.string().length(9).describe('9-character ORI code (unused — endpoint unavailable).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI agency profile endpoint (UCR /agencies/{ori}) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Look up agency details at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI agency profile is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
