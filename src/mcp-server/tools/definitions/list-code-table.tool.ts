/**
 * @fileoverview FBI code table tool — currently unavailable.
 * The UCR code table backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/tools/definitions/list-code-table.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

const VALID_TABLES = [
  'offenses',
  'bias_motivation',
  'location_type',
  'weapon_type',
  'population_group',
  'victim_type',
  'prop_desc',
  'resident_status',
  'relationship',
  'circumstance',
] as const;

export const fbiListCodeTable = tool('fbi_list_code_table', {
  title: 'FBI List Code Table',
  description:
    '[UNAVAILABLE] The FBI code table endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For code reference values, consult the FBI CDE website at cde.ucr.cjis.gov.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the UCR code tables backend has been decommissioned.',
      recovery:
        'The code table endpoint is no longer available. Reference code values at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    table: z.enum(VALID_TABLES).describe('Code table name (unused — endpoint unavailable).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI code table endpoint (UCR /codes/) has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Reference code values at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI code tables are unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
