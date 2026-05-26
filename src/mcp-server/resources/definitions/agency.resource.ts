/**
 * @fileoverview FBI agency profile resource — currently unavailable.
 * The UCR agency lookup backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/resources/definitions/agency.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

export const agencyResource = resource('fbi://agency/{ori}', {
  name: 'fbi-agency-profile',
  description:
    '[UNAVAILABLE] The FBI agency profile endpoint has been decommissioned. Attempting to read this resource will return a ServiceUnavailable error. For agency details, consult the FBI CDE website at cde.ucr.cjis.gov.',
  mimeType: 'application/json',
  params: z.object({
    ori: z.string().describe('9-character ORI (Originating Agency Identifier) code.'),
  }),
  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(params, _ctx) {
    throw serviceUnavailable(
      `The FBI agency profile endpoint has been decommissioned. Cannot retrieve profile for ORI "${params.ori}". Look up agency details at cde.ucr.cjis.gov.`,
    );
  },
});
