/**
 * @fileoverview Real loopback MCP discovery, disabled landing-card, and limit-clamp-mode contracts.
 * @module tests/discovery.test
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
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

/** A loopback port free when the call returns. */
async function freePort(): Promise<number> {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback port');
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

/** JSON-RPC over the server's streamable HTTP endpoint, one POST per call. */
function rpcClient(origin: string) {
  let id = 0;
  return async (method: string, params?: Record<string, unknown>) => {
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
}

/**
 * Runs `body` against the server started from source over loopback HTTP, after its landing page
 * answers and a session is initialized, then stops it. FBI_CLAMP_LIMITS is always passed, so a
 * developer's `.env` (which Bun loads without overriding the environment) cannot change it.
 */
async function withServer(
  env: { FBI_CLAMP_LIMITS: 'true' | 'false' } & Record<string, string>,
  body: (server: { landing: string; rpc: ReturnType<typeof rpcClient> }) => Promise<void>,
): Promise<void> {
  const port = await freePort();
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
      ...env,
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
    const rpc = rpcClient(origin);
    await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'discovery-test', version: '1' },
    });
    await body({ landing, rpc });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

it('serves seven callable tools, the guide skill as its only resource, and five disabled operator cards', async () => {
  await withServer({ FBI_CLAMP_LIMITS: 'true' }, async ({ landing, rpc }) => {
    const tools = await rpc('tools/list');
    expect(tools.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'fbi_get_arrests',
      'fbi_get_crime_estimates',
      'fbi_get_hate_crimes',
      'fbi_get_leoka',
      'fbi_get_nibrs_breakdown',
      'fbi_get_police_employees',
      'fbi_search_agencies',
    ]);
    const employees = tools.result.tools.find(
      (tool: { name: string }) => tool.name === 'fbi_get_police_employees',
    );
    expect(Object.keys(employees.inputSchema.properties)).toEqual([
      'scope',
      'state_abbr',
      'ori',
      'from_year',
      'to_year',
    ]);
    expect(employees.inputSchema.required).toEqual(['scope', 'from_year', 'to_year']);
    expect(employees.inputSchema.properties.from_year.minimum).toBe(1985);
    expect(employees.inputSchema.properties.to_year.minimum).toBe(1985);
    expect(employees.inputSchema.properties.state_abbr.pattern).toBe('^[A-Za-z]{2}$');
    expect(employees.inputSchema.properties.ori.pattern).toBe('^[A-Za-z0-9]{9}$');
    expect(employees.outputSchema.properties).toHaveProperty('years');
    const employeesCard = landing.match(
      /<article\b[^>]*id="tool-fbi_get_police_employees"[^>]*>[\s\S]*?<\/article>/,
    )?.[0];
    expect(employeesCard).toBeDefined();
    expect(employeesCard).not.toContain('data-mutability="disabled"');
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
      ['fbi_get_arrests', 'offense', 1985, 48],
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
    expect(directory.inputSchema.properties.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      default: 50,
    });
    expect(directory.inputSchema.properties.limit).not.toHaveProperty('maximum');
    expect(directory.inputSchema.properties.limit.description).toContain('at most 200');
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
    // The retired agency/state resources stay unregistered; the only resources are the served skill.
    const resources = await rpc('resources/list');
    expect(resources.error).toBeUndefined();
    expect(resources.result.resources.map((resource: { uri: string }) => resource.uri)).toEqual([
      'skill://fbi-crime-guide/SKILL.md',
    ]);
    const templates = await rpc('resources/templates/list');
    expect(templates.error).toBeUndefined();
    expect(
      templates.result.resourceTemplates.map(
        (template: { uriTemplate: string }) => template.uriTemplate,
      ),
    ).toEqual(['skill://{+path}']);
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
  });
}, 20000);

it('with FBI_CLAMP_LIMITS=false, advertises maximum 200 and rejects limit 201 before fetching the directory', async () => {
  /** Paths the server requested from its CDE base URL, which points at this loopback recorder. */
  const requested: string[] = [];
  const upstream = createHttpServer((request, response) => {
    requested.push(new URL(request.url ?? '/', 'http://upstream.test').pathname);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        BEXAR: [
          {
            ori: 'TX0150000',
            counties: 'BEXAR',
            is_nibrs: true,
            state_abbr: 'TX',
            agency_name: "Bexar County Sheriff's Office",
            agency_type_name: 'County',
            nibrs_start_date: null,
          },
        ],
      }),
    );
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Missing upstream port');
  try {
    await withServer(
      { FBI_CLAMP_LIMITS: 'false', FBI_API_BASE_CDE: `http://127.0.0.1:${address.port}` },
      async ({ rpc }) => {
        const tools = await rpc('tools/list');
        const directory = tools.result.tools.find(
          (tool: { name: string }) => tool.name === 'fbi_search_agencies',
        );
        expect(directory.inputSchema.properties.limit).toMatchObject({
          type: 'integer',
          minimum: 1,
          maximum: 200,
          default: 50,
          description: 'Agencies per page (1–200). Defaults to 50.',
        });
        const rejected = await rpc('tools/call', {
          name: 'fbi_search_agencies',
          arguments: { state_abbr: 'TX', limit: 201 },
        });
        expect(rejected.result.isError).toBe(true);
        expect(rejected.result.structuredContent.error).toMatchObject({
          code: -32602,
          data: {
            reason: 'invalid_arguments',
            issues: [{ code: 'too_big', maximum: 200, path: ['limit'] }],
          },
        });
        expect(requested).toEqual([]);
        // The same call at the maximum reaches the recorder, so the empty log above is the rejection.
        const served = await rpc('tools/call', {
          name: 'fbi_search_agencies',
          arguments: { state_abbr: 'TX', limit: 200 },
        });
        expect(served.result.isError).not.toBe(true);
        expect(served.result.structuredContent).toMatchObject({
          total: 1,
          agencies: [{ ori: 'TX0150000' }],
        });
        expect(requested).toEqual(['/agency/byStateAbbr/TX']);
      },
    );
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 20000);
