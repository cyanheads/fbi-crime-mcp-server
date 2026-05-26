/**
 * @fileoverview FBI state crime overview resource.
 * Returns current-year participation rates and UCR/NIBRS adoption for a state.
 * @module mcp-server/resources/definitions/state.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { notFound } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

export const stateResource = resource('fbi://state/{state_abbr}', {
  name: 'fbi-state-overview',
  description:
    'State crime overview — current-year participation rates, UCR vs. NIBRS adoption, total reporting agencies, and population covered. Provides fast "is this state\'s data trustworthy?" context for downstream tools.',
  mimeType: 'application/json',
  params: z.object({
    state_abbr: z.string().describe('Two-letter US state abbreviation (e.g. CA, TX, NY).'),
  }),
  output: z.object({
    state_abbr: z.string().optional().describe('State abbreviation.'),
    state_name: z.string().optional().describe('Full state name.'),
    year: z.number().optional().describe('Most recent data year available.'),
    agency_count: z.number().nullable().optional().describe('Total agencies in this state.'),
    months_reported: z
      .number()
      .nullable()
      .optional()
      .describe('Average months reported across agencies.'),
    nibrs_participating: z
      .number()
      .nullable()
      .optional()
      .describe('Number of NIBRS-reporting agencies.'),
    total_population: z.number().nullable().optional().describe('Total state population.'),
    covered_population: z
      .number()
      .nullable()
      .optional()
      .describe('Population covered by reporting agencies.'),
  }),

  async handler(params, ctx) {
    const svc = getFbiApiService();
    ctx.log.debug('fbi://state resource', { state_abbr: params.state_abbr });
    const rows = await svc.getCdeParticipationState(params.state_abbr, {}, ctx);

    if (rows.length === 0) {
      throw notFound(
        `No participation data found for state "${params.state_abbr}". Check the state abbreviation spelling.`,
      );
    }

    const [row] = rows;
    return row ?? {};
  },
});
