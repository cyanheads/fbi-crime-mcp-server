/**
 * @fileoverview FBI state overview resource — currently unavailable.
 * The CDE participation backend (/LATEST/participation/state/) has been decommissioned.
 * @module mcp-server/resources/definitions/state.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const stateResource = resource('fbi://state/{state_abbr}', {
  name: 'fbi-state-overview',
  description:
    '[UNAVAILABLE] The FBI state participation endpoint has been decommissioned. The CDE /LATEST/participation/state/ path returns 404. Attempting to read this resource will return a ServiceUnavailable error.',
  mimeType: 'application/json',
  params: z.object({
    state_abbr: z.string().describe('Two-letter US state abbreviation (e.g. CA, TX, NY).'),
  }),
  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(params, _ctx) {
    throw serviceUnavailable(
      `The FBI state participation endpoint has been decommissioned. Cannot retrieve overview for state "${params.state_abbr}". The CDE /LATEST/participation/ paths return 404.`,
    );
  },
});
