/**
 * @fileoverview FBI participation tool — currently unavailable.
 * Both UCR and CDE participation backends have been decommissioned.
 * @module mcp-server/tools/definitions/get-participation.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const fbiGetParticipation = tool('fbi_get_participation', {
  title: 'FBI Get Participation',
  description:
    '[UNAVAILABLE] The FBI UCR/NIBRS participation endpoint has been decommissioned. Both the UCR legacy backend and the CDE /LATEST/participation/ paths return 404. This tool will return an error on every call. For participation data, consult the FBI CDE website at cde.ucr.cjis.gov or download bulk data files.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — both UCR and CDE participation backends have been decommissioned.',
      recovery:
        'The participation endpoint is no longer available. Access participation data at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    scope: z.enum(['national', 'state', 'agency']).describe('Scope (unused).'),
    state_abbr: z.string().length(2).optional().describe('State abbreviation (unused).'),
    year: z.number().int().min(1960).max(2030).optional().describe('Year (unused).'),
    nibrs_only: z.boolean().optional().describe('NIBRS filter (unused).'),
    page: z.number().int().min(1).default(1).describe('Page (unused).'),
    per_page: z.number().int().min(1).max(100).default(50).describe('Per page (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI participation endpoint has been decommissioned. Both the UCR legacy backend and CDE /LATEST/participation/ paths return 404. Access participation data at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI participation data is unavailable** — both UCR and CDE participation backends have been decommissioned.',
    },
  ],
});
