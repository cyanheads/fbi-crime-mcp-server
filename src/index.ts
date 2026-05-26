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
    'FBI Crime Data Explorer MCP server. Provides access to UCR crime estimates, NIBRS incident breakdowns, agency offense counts, hate crimes, arrests, human trafficking, arson, LEOKA, and participation data.\n' +
    '- Always call fbi_get_participation alongside crime count queries to assess data reliability\n' +
    '- Use fbi_search_agencies to look up ORI codes before querying agency-level tools\n' +
    '- Use fbi_list_code_table to find valid offense names, bias codes, and other parameter values\n' +
    '- NIBRS tools (fbi_get_nibrs_breakdown) cover incident-based reporting only — not all agencies participate',
  setup(core) {
    const serverConfig = getServerConfig();
    initFbiApiService(core.config, core.storage, serverConfig);
  },
});
