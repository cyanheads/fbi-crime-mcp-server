/**
 * @fileoverview Real loopback MCP discovery and disabled landing-card contracts.
 * @module tests/discovery.test
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';

const disabledNames = [
  'fbi_get_agency',
  'fbi_get_participation',
  'fbi_list_code_table',
  'fbi_get_human_trafficking',
  'fbi_get_arson',
];

it('serves six callable tools, no resources, and five disabled operator cards', async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const child = spawn('bun', ['src/index.ts'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      MCP_TRANSPORT_TYPE: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: String(port),
      MCP_AUTH_MODE: 'none',
      MCP_LOG_LEVEL: 'error',
      FBI_API_KEY: 'TEST_KEY',
      OTEL_ENABLED: 'false',
      STORAGE_PROVIDER_TYPE: 'in-memory',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    logs += String(chunk);
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    let landing = '';
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
      try {
        const response = await fetch(origin);
        if (response.ok) {
          landing = await response.text();
          break;
        }
      } catch {
        /* Server is still starting. */
      }
      await delay(25);
    }
    expect(landing, logs).not.toBe('');
    let id = 0;
    const rpc = async (method: string, params?: unknown) => {
      const response = await fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-11-25',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, ...(params && { params }) }),
      });
      const body = await response.text();
      const json = body.startsWith('event:')
        ? body
            .split('\n')
            .find((line) => line.startsWith('data:'))
            ?.slice(5)
        : body;
      return JSON.parse(json ?? body);
    };
    await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'discovery-test', version: '1' },
    });
    const tools = await rpc('tools/list');
    expect(tools.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'fbi_get_arrests',
      'fbi_get_crime_estimates',
      'fbi_get_hate_crimes',
      'fbi_get_leoka',
      'fbi_get_nibrs_breakdown',
      'fbi_search_agencies',
    ]);
    const nibrs = tools.result.tools.find(
      (tool: { name: string }) => tool.name === 'fbi_get_nibrs_breakdown',
    );
    expect(nibrs.inputSchema.required).toEqual(['scope', 'offense', 'from_year', 'to_year']);
    expect(nibrs.inputSchema.properties.offense.enum).toHaveLength(71);
    expect(nibrs.inputSchema.properties.offense.enum).not.toContain('all');
    expect(nibrs.inputSchema.properties.offense.enum).not.toContain('23*');
    expect(nibrs.inputSchema.properties.offense).not.toHaveProperty('default');
    expect(nibrs.inputSchema.properties.from_year.minimum).toBe(1991);
    expect(nibrs.inputSchema.properties.to_year.minimum).toBe(1991);
    expect(nibrs.outputSchema.properties).toHaveProperty('offense_details');
    const nibrsCard = landing.match(
      /<article\b[^>]*id="tool-fbi_get_nibrs_breakdown"[^>]*>[\s\S]*?<\/article>/,
    )?.[0];
    expect(nibrsCard).toBeDefined();
    expect(nibrsCard).not.toContain('data-mutability="disabled"');
    for (const [name, selector, floor, codes] of [
      ['fbi_get_hate_crimes', 'bias', 1991, 35],
      ['fbi_get_arrests', 'offense', 1985, 47],
    ] as const) {
      const totals = tools.result.tools.find((tool: { name: string }) => tool.name === name);
      expect(totals.inputSchema.required).toEqual(['scope', 'from_year', 'to_year']);
      expect(totals.inputSchema.properties[selector].enum).toHaveLength(codes);
      expect(totals.inputSchema.properties[selector].enum).toContain('all');
      expect(totals.inputSchema.properties[selector].default).toBe('all');
      expect(totals.inputSchema.properties.from_year.minimum).toBe(floor);
      expect(totals.inputSchema.properties.to_year.minimum).toBe(floor);
      expect(totals.inputSchema.properties.ori.pattern).toBe('^[A-Za-z0-9]{9}$');
      const card = landing.match(
        new RegExp(`<article\\b[^>]*id="tool-${name}"[^>]*>[\\s\\S]*?<\\/article>`),
      )?.[0];
      expect(card).toBeDefined();
      expect(card).not.toContain('data-mutability="disabled"');
    }
    const summarized = tools.result.tools.find(
      (tool: { name: string }) => tool.name === 'fbi_get_crime_estimates',
    );
    expect(summarized.inputSchema.properties.state_abbr.pattern).toBe('^[A-Za-z]{2}$');
    expect(summarized.inputSchema.properties.ori.pattern).toBe('^[A-Za-z0-9]{9}$');
    const directory = tools.result.tools.find(
      (tool: { name: string }) => tool.name === 'fbi_search_agencies',
    );
    expect(directory.inputSchema.required).toEqual(['state_abbr']);
    expect(directory.inputSchema.properties.state_abbr.pattern).toBe('^[A-Za-z]{2}$');
    expect(directory.inputSchema.properties.agency_type.enum).toEqual([
      'City',
      'County',
      'Other State Agency',
      'Other',
      'State Police',
      'University or College',
      'Tribal',
    ]);
    expect(directory.inputSchema.properties.limit).toMatchObject({ minimum: 1, maximum: 200 });
    expect(Object.keys(directory.inputSchema.properties).sort()).toEqual([
      'agency_type',
      'county',
      'limit',
      'name_contains',
      'offset',
      'state_abbr',
    ]);
    expect(Object.keys(directory.outputSchema.properties)).toEqual(
      expect.arrayContaining(['state_abbr', 'total', 'offset', 'next_offset', 'agencies']),
    );
    for (const [method, field] of [
      ['resources/list', 'resources'],
      ['resources/templates/list', 'resourceTemplates'],
    ] as const) {
      const result = await rpc(method);
      expect(result.error).toBeUndefined();
      expect(result.result[field]).toEqual([]);
    }
    for (const name of disabledNames) {
      const call = await rpc('tools/call', { name, arguments: {} });
      expect(call.error).toEqual({ code: -32602, message: `Tool ${name} not found` });
      expect(call.result).toBeUndefined();
      expect(JSON.stringify(call)).not.toContain('endpoint_decommissioned');
      expect(landing).toContain(name);
      const card = landing.match(
        new RegExp(`<article\\b[^>]*id="tool-${name}"[^>]*>[\\s\\S]*?<\\/article>`),
      )?.[0];
      expect(card).toContain('data-mutability="disabled"');
      expect(card).toContain('retired');
      expect(card).toContain('cde.ucr.cjis.gov');
      expect(card).not.toContain('<summary>invocation</summary>');
    }
    const disabledCards = [...landing.matchAll(/<article\b[^>]*>/g)]
      .filter(([tag]) => tag.includes('data-mutability="disabled"'))
      .map(([tag]) => /\bdata-name="([^"]+)"/.exec(tag)?.[1]);
    expect(disabledCards.sort()).toEqual([...disabledNames].sort());
    const agencyCard = landing.match(
      /<article\b[^>]*id="tool-fbi_get_agency"[^>]*>[\s\S]*?<\/article>/,
    )?.[0];
    expect(agencyCard).toContain('fbi_search_agencies');
    const searchCard = landing.match(
      /<article\b[^>]*id="tool-fbi_search_agencies"[^>]*>[\s\S]*?<\/article>/,
    )?.[0];
    expect(searchCard).toBeDefined();
    expect(searchCard).not.toContain('data-mutability="disabled"');
    expect(landing).not.toContain('fbi_get_agency_offenses');
    expect(landing).not.toContain('fbi://agency/');
    expect(landing).not.toContain('fbi://state/');
    expect(landing).toContain('disabled');
    expect(landing).toContain('cde.ucr.cjis.gov');
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}, 20000);
