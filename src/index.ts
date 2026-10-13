#!/usr/bin/env node
/**
 * @fileoverview fbi-crime-mcp-server MCP server entry point.
 * Exposes two FBI CDE tools and retains nine disabled operator definitions.
 * @module index
 */

import { createApp, disabledTool } from '@cyanheads/mcp-ts-core';
import { getServerConfig } from './config/server-config.js';
import { fbiGetAgency } from './mcp-server/tools/definitions/get-agency.tool.js';
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
  sessionMode: 'stateless',
  tools: [
    disabledTool(fbiListCodeTable, {
      reason: 'UCR code-table endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiSearchAgencies, {
      reason: 'UCR agency-search endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetAgency, {
      reason: 'UCR agency-profile endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetParticipation, {
      reason: 'UCR/CDE participation endpoints retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    fbiGetCrimeEstimates,
    disabledTool(fbiGetNibrsBreakdown, {
      reason: 'UCR NIBRS endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetArrests, {
      reason: 'UCR arrests endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetHateCrimes, {
      reason: 'UCR hate-crimes endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetHumanTrafficking, {
      reason: 'UCR human-trafficking endpoint retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    fbiGetLeoka,
    disabledTool(fbiGetArson, {
      reason:
        'UCR arson endpoint retired. Use fbi_get_crime_estimates with offense="arson", or consult https://cde.ucr.cjis.gov/.',
    }),
  ],
  resources: [],
  prompts: [],
  instructions:
    'FBI Crime Data Explorer MCP server (post-UCR decommission). Only CDE summarized and LEOKA endpoints are active.\n' +
    '- Use fbi_get_crime_estimates for monthly national, state or agency offense rates/counts and provider populations/coverage. National omits identifiers; state uses only state_abbr; agency uses only ori. Coverage may be null or incomplete.\n' +
    '- Use fbi_get_leoka for officer fatality, weapon and circumstance data. YTD omits month; monthly requires month.\n' +
    '- Two tools are callable. Nine retired tools remain disabled on the operator landing page; no resources are registered. Consult https://cde.ucr.cjis.gov/ for other datasets.',
  setup(core) {
    const serverConfig = getServerConfig();
    initFbiApiService(core.config, core.storage, serverConfig);
  },
});
