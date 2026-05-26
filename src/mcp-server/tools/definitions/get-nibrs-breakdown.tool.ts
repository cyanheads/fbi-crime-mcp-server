/**
 * @fileoverview FBI NIBRS breakdown tool — currently unavailable.
 * The UCR NIBRS breakdown backend (crime-data-api.fr.cloud.gov) was decommissioned.
 * @module mcp-server/tools/definitions/get-nibrs-breakdown.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';

const OFFENDER_VARIABLES = [
  'ethnicity',
  'race_code',
  'sex_code',
  'age_num',
  'offense_name',
  'location_name',
  'prop_desc_name',
] as const;
const VICTIM_VARIABLES = [
  'ethnicity',
  'race_code',
  'sex_code',
  'age_num',
  'offense_name',
  'location_name',
  'prop_desc_name',
  'offender_relationship',
  'resident_status_code',
  'circumstance_name',
] as const;
const OFFENSE_VARIABLES = [
  'offense_name',
  'weapon_name',
  'location_name',
  'method_entry_code',
  'num_premises_entered',
] as const;
const ALL_VARIABLES = [
  ...new Set([...OFFENDER_VARIABLES, ...VICTIM_VARIABLES, ...OFFENSE_VARIABLES]),
] as const;

export const fbiGetNibrsBreakdown = tool('fbi_get_nibrs_breakdown', {
  title: 'FBI Get NIBRS Breakdown',
  description:
    '[UNAVAILABLE] The FBI NIBRS breakdown endpoint has been decommissioned. The UCR backend (crime-data-api.fr.cloud.gov) no longer responds. This tool will return an error on every call. For NIBRS data, consult the FBI CDE website at cde.ucr.cjis.gov.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'endpoint_decommissioned',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'Always — the UCR NIBRS backend has been decommissioned.',
      recovery:
        'The NIBRS breakdown endpoint is no longer available. Access NIBRS data at cde.ucr.cjis.gov.',
    },
  ],

  input: z.object({
    dimension: z.enum(['offenders', 'victims', 'offenses']).describe('Dimension (unused).'),
    variable: z.enum(ALL_VARIABLES).describe('Grouping variable (unused).'),
    scope: z.enum(['national', 'state']).describe('Scope (unused).'),
    state_abbr: z.string().length(2).optional().describe('State abbreviation (unused).'),
    offense_name: z.string().optional().describe('Offense filter (unused).'),
    since_year: z.number().int().min(1985).max(2030).optional().describe('Start year (unused).'),
    until_year: z.number().int().min(1985).max(2030).optional().describe('End year (unused).'),
  }),

  output: z.object({}).passthrough().describe('Always empty — handler always throws.'),

  async handler(_input, _ctx) {
    throw serviceUnavailable(
      'The FBI NIBRS breakdown endpoint has been decommissioned. The Cloud Foundry backend (crime-data-api.fr.cloud.gov) no longer exists. Access NIBRS data at cde.ucr.cjis.gov.',
    );
  },

  format: () => [
    {
      type: 'text',
      text: '**FBI NIBRS breakdown is unavailable** — the UCR backend has been decommissioned.',
    },
  ],
});
