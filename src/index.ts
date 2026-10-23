#!/usr/bin/env node
/**
 * @fileoverview fbi-crime-mcp-server MCP server entry point.
 * Exposes six FBI CDE tools and retains five disabled operator definitions.
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
    fbiSearchAgencies,
    disabledTool(fbiGetAgency, {
      reason:
        'UCR agency-profile endpoint retired. Use fbi_search_agencies for agency ORI, type, counties and NIBRS status, or consult https://cde.ucr.cjis.gov/.',
    }),
    disabledTool(fbiGetParticipation, {
      reason: 'UCR/CDE participation endpoints retired. Consult https://cde.ucr.cjis.gov/.',
    }),
    fbiGetCrimeEstimates,
    fbiGetNibrsBreakdown,
    fbiGetArrests,
    fbiGetHateCrimes,
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
    'FBI Crime Data Explorer MCP server (post-UCR decommission).\n- Use fbi_search_agencies to find an agency ORI by state, name words, county or type, then pass it as ori with scope "agency" to the scoped tools below. National scope omits identifiers; state uses only state_abbr; agency uses only ori.\n- Use fbi_get_crime_estimates for monthly offense rates/counts and provider populations/coverage; set include_comparisons for the state/national comparison rates. Coverage may be null or incomplete.\n- Use fbi_get_hate_crimes, fbi_get_arrests and fbi_get_nibrs_breakdown for category totals summed over a month window: hate crimes by bias motivation, arrests by offense and arrestee demographics, NIBRS victim/offender/offense details for one offense. All-zero hate-crime and arrest results can also mean an unrecognized state or ORI; NIBRS fails with no_data then.\n- Use fbi_get_leoka for officer fatality, weapon and circumstance data. YTD omits month; monthly requires month.\n- Years run through the current year, from 1985 (estimates, arrests), 1991 (hate crimes, NIBRS) or 2020 (LEOKA).\n- Six tools are callable. Five retired tools remain disabled on the operator landing page; no resources are registered. Consult https://cde.ucr.cjis.gov/ for other datasets.',
  setup(core) {
    const serverConfig = getServerConfig();
    initFbiApiService(core.config, core.storage, serverConfig);
  },
});
