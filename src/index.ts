#!/usr/bin/env node
/**
 * @fileoverview fbi-crime-mcp-server MCP server entry point.
 * Exposes the FBI Crime Data Explorer API via MCP tools and resources.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
import { getServerConfig } from './config/server-config.js';
// Resource definitions
import { agencyResource } from './mcp-server/resources/definitions/agency.resource.js';
import { stateResource } from './mcp-server/resources/definitions/state.resource.js';
import { fbiGetAgency } from './mcp-server/tools/definitions/get-agency.tool.js';
import { fbiGetAgencyOffenses } from './mcp-server/tools/definitions/get-agency-offenses.tool.js';
import { fbiGetArrests } from './mcp-server/tools/definitions/get-arrests.tool.js';
import { fbiGetArson } from './mcp-server/tools/definitions/get-arson.tool.js';
import { fbiGetCrimeEstimates } from './mcp-server/tools/definitions/get-crime-estimates.tool.js';
import { fbiGetHateCrimes } from './mcp-server/tools/definitions/get-hate-crimes.tool.js';
import { fbiGetHumanTrafficking } from './mcp-server/tools/definitions/get-human-trafficking.tool.js';
import { fbiGetLeoka } from './mcp-server/tools/definitions/get-leoka.tool.js';
import { fbiGetNibrsBreakdown } from './mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';
import { fbiGetParticipation } from './mcp-server/tools/definitions/get-participation.tool.js';
// Tool definitions
import { fbiListCodeTable } from './mcp-server/tools/definitions/list-code-table.tool.js';
import { fbiSearchAgencies } from './mcp-server/tools/definitions/search-agencies.tool.js';
import { initFbiApiService } from './services/fbi-api/fbi-api-service.js';

await createApp({
  name: 'fbi-crime-mcp-server',
  title: 'fbi-crime-mcp-server',
  tools: [
    fbiListCodeTable,
    fbiSearchAgencies,
    fbiGetAgency,
    fbiGetParticipation,
    fbiGetCrimeEstimates,
    fbiGetAgencyOffenses,
    fbiGetNibrsBreakdown,
    fbiGetArrests,
    fbiGetHateCrimes,
    fbiGetHumanTrafficking,
    fbiGetLeoka,
    fbiGetArson,
  ],
  resources: [agencyResource, stateResource],
  prompts: [],
  instructions:
    'FBI Crime Data Explorer MCP server (post-UCR decommission). Only CDE summarized and LEOKA endpoints are active.\n' +
    '- Use fbi_get_crime_estimates for national, state, or agency-level offense trends (per-100k rates and counts by month)\n' +
    '- Use fbi_get_agency_offenses for agency-scoped offense data when the ORI is already known\n' +
    '- Use fbi_get_leoka for officer fatality, weapon, and circumstance data\n' +
    '- All other tools (participation, agency search, code tables, NIBRS, arrests, hate crimes, arson, human trafficking) are decommissioned — they return errors; consult cde.ucr.cjis.gov for those datasets',
  setup(core) {
    const serverConfig = getServerConfig();
    initFbiApiService(core.config, core.storage, serverConfig);
  },
});
