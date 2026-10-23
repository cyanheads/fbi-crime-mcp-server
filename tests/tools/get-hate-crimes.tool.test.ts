/**
 * @fileoverview Tests for fbi_get_hate_crimes through the real CDE service and captured payloads.
 * @module tests/tools/get-hate-crimes.tool.test
 */

import { readFileSync } from 'node:fs';
import { parseConfig } from '@cyanheads/mcp-ts-core/config';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  createFetchMock,
  createInMemoryStorage,
  runToolContract,
} from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const origin = 'https://cde.example.test';
const year2023 = { from_year: 2023, to_year: 2023 };

type Counts = Record<string, number | null>;
interface HatePayload {
  bias_section: Record<string, Counts>;
  incident_section: Record<string, Counts>;
  last_refresh_date?: Record<string, string>;
}
type Result = Awaited<ReturnType<typeof runToolContract>>;

function capture(name: string): HatePayload {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'),
  ) as HatePayload;
}

function text(result: Result): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

let http: ReturnType<typeof createFetchMock>;
beforeEach(() => {
  http = createFetchMock();
  http.install();
  initFbiApiService(parseConfig(), createInMemoryStorage(), {
    apiKey: 'TEST_KEY',
    baseUrlUcr: origin,
    baseUrlCde: origin,
    requestTimeoutMs: 15000,
  });
});
afterEach(() => {
  http.restore();
  vi.useRealTimers();
});

function reply(path: string, payload: unknown): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return url.origin === origin && url.pathname === path;
    },
    respond: Response.json(payload),
  });
}

function requestUrl(): URL {
  const call = http.calls[0];
  if (!call) throw new Error('no fetch was made');
  return new URL(call.request.url);
}

function expectReason(result: Result, reason: string, code: number): void {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code, data: { reason } } });
  expect(text(result)).toContain(reason);
}

/** Every table content[] renders, in order: CDE section, dimension, and its `### ` heading. */
const TABLES = [
  ['incident_section', 'bias', 'Incidents by bias'],
  ['incident_section', 'bias_category', 'Incidents by bias category'],
  ['bias_section', 'offense_type', 'Offense type'],
  ['bias_section', 'location_type', 'Location type'],
  ['bias_section', 'offender_race', 'Offender race'],
  ['bias_section', 'offender_ethnicity', 'Offender ethnicity'],
  ['bias_section', 'judicial_district', 'Judicial district'],
] as const;

/** The data rows of the table under `### <heading>`, header and separator excluded. */
function tableRows(body: string, heading: string): string[] {
  const lines = body.split('\n');
  const start = lines.indexOf(`### ${heading}`);
  expect(start, `missing table ### ${heading}`).toBeGreaterThanOrEqual(0);
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('|')) break;
    rows.push(line);
  }
  return rows.slice(2);
}

/**
 * Every dimension appears in structuredContent with its categories in CDE's order, and as its own
 * table in content[] whose rows are exactly its categories in that order.
 */
function expectEveryCategory(result: Result, payload: HatePayload): void {
  const structured = result.structuredContent as unknown as HatePayload;
  const body = text(result);
  for (const section of ['incident_section', 'bias_section'] as const) {
    expect(Object.keys(structured[section]).sort()).toEqual(Object.keys(payload[section]).sort());
  }
  expect(body.split('\n').filter((line) => line.startsWith('### '))).toEqual(
    TABLES.map(([, , heading]) => `### ${heading}`),
  );
  let cells = 0;
  for (const [section, dimension, heading] of TABLES) {
    const counts = payload[section][dimension];
    if (!counts) throw new Error(`payload has no ${section}.${dimension}`);
    expect(Object.entries(structured[section][dimension] ?? {})).toEqual(Object.entries(counts));
    const expected = Object.entries(counts).map(([category, count]) => {
      const label = category.replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&');
      return `| ${label} | ${count === null ? '—' : count.toLocaleString('en-US')} |`;
    });
    expect(tableRows(body, heading), heading).toEqual(expected);
    cells += expected.length;
  }
  expect(cells).toBe(286);
}

/** Route every CDE request so one made despite an early failure lands in `http.calls`. */
function catchAllRequests(): void {
  http.route({
    match: (request) => new URL(request.url).origin === origin,
    respond: Response.json({}),
  });
}

/** The schema rejected exactly `field`, before any request. */
function expectFieldRejected(result: Result, field: string): void {
  expectReason(result, 'invalid_arguments', JsonRpcErrorCode.InvalidParams);
  const issues = (result.structuredContent as { error: { data: { issues: { path: string[] }[] } } })
    .error.data.issues;
  expect(issues.map((issue) => issue.path)).toEqual([[field]]);
  expect(http.calls).toHaveLength(0);
}

/** The `Codes:` listing in a selector description, as its codes in listed order. */
function listedCodes(description: string | undefined): string[] {
  const listing = description?.split('Codes: ')[1]?.replace(/\.$/, '');
  if (!listing) throw new Error('description has no Codes: listing');
  return listing.split('; ').map((entry) => entry.slice(0, entry.indexOf(' ')));
}

describe('fbi_get_hate_crimes scopes', () => {
  it('national scope relays every CDE category with type=totals and MM-YYYY bounds', async () => {
    const payload = capture('hate-national-2023');
    reply('/hate-crime/national/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(http.calls).toHaveLength(1);
    const url = requestUrl();
    expect(url.searchParams.get('type')).toBe('totals');
    expect(url.searchParams.get('from')).toBe('01-2023');
    expect(url.searchParams.get('to')).toBe('12-2023');
    expect(result.structuredContent).toMatchObject({
      scope: 'national',
      bias: 'all',
      bias_label: 'All bias motivations',
      from: '01-2023',
      to: '12-2023',
      data_last_updated: '10/15/2026',
      incident_section: { bias_category: { Religion: 2769, 'Race/Ethnicity/Ancestry': 6036 } },
      bias_section: { offense_type: { Intimidation: 4629, Incest: 0 } },
    });
    expect(result.structuredContent).not.toHaveProperty('state_abbr');
    expect(result.structuredContent).not.toHaveProperty('ori');
    expect(result.structuredContent).not.toHaveProperty('notice');
    expectEveryCategory(result, payload);
    const body = text(result);
    expect(body).toContain('## FBI Hate Crimes — National');
    expect(body).toContain('**Bias:** all (All bias motivations)');
    expect(body).toContain('**Range:** 01-2023 → 12-2023');
    expect(body).toContain('**Data last updated:** 10/15/2026');
    expect(body).toContain('### Incidents by bias category');
    expect(body).toContain('### Judicial district');
    expect(body).toContain('do not sum to one total');
    expect(body).toContain("| Anti-Jehovah's Witness | 17 |");
    expect(body).toContain('| Anti-Gay \\(Male\\) | 1,087 |');
  });

  it('state scope uppercases the abbreviation into the path and echo', async () => {
    const payload = capture('hate-state-tx-2023');
    reply('/hate-crime/state/TX/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'state',
      state_abbr: 'tx',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'state',
      state_abbr: 'TX',
      incident_section: { bias_category: { 'Race/Ethnicity/Ancestry': 273 } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('## FBI Hate Crimes — TX');
    expect(text(result)).toContain('**Scope:** state | **State:** TX');
  });

  it('agency scope uppercases the ORI into the path and echo', async () => {
    const payload = capture('hate-agency-txspd0000-2023');
    reply('/hate-crime/agency/TXSPD0000/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'agency',
      ori: 'txspd0000',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'agency',
      ori: 'TXSPD0000',
      incident_section: { bias_category: { 'Race/Ethnicity/Ancestry': 21, Religion: 6 } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('**Scope:** agency | **ORI:** TXSPD0000');
  });
});

describe('fbi_get_hate_crimes bias selector', () => {
  it('sends a bias code as the path segment and echoes its CDE label', async () => {
    reply('/hate-crime/national/12', capture('hate-national-bias12-2023'));
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'national',
      bias: '12',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      bias: '12',
      bias_label: 'Anti-Black or African American',
      incident_section: { bias: { 'Anti-Black or African American': 3093, 'Multiple Bias': 210 } },
      bias_section: { offense_type: { Intimidation: 1503 } },
    });
    expect(text(result)).toContain('**Bias:** 12 (Anti-Black or African American)');
  });

  it('advertises all plus the 34 probed codes, each mapped to its label in the description', () => {
    const bias = fbiGetHateCrimes.input.shape.bias;
    const values = bias.unwrap().options;
    expect(values).toHaveLength(35);
    expect(values).toContain('all');
    expect(values).toContain('15');
    expect(values).toContain('85');
    expect(listedCodes(bias.description)).toEqual(values.filter((value) => value !== 'all'));
    expect(bias.description).toContain('11 Anti-White');
    expect(bias.description).toContain('28 Anti-Church of Jesus Christ');
    expect(bias.description).toContain('85 Anti-Sikh');
  });

  for (const bias of ['anti-black', '99', 'Anti-White']) {
    it(`rejects bias ${JSON.stringify(bias)} before any request`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetHateCrimes, {
        scope: 'national',
        bias: bias as '11',
        ...year2023,
      });
      expectFieldRejected(result, 'bias');
    });
  }
});

describe('fbi_get_hate_crimes input contract', () => {
  for (const field of ['from_year', 'to_year'] as const) {
    it(`rejects ${field} 1990 in the schema without fetching`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetHateCrimes, {
        scope: 'national',
        from_year: 1991,
        to_year: 1991,
        [field]: 1990,
      });
      expectFieldRejected(result, field);
      expect(text(result)).toContain('1991');
    });
  }

  it('accepts the 1991 floor', async () => {
    reply('/hate-crime/national/all', capture('hate-national-2023'));
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'national',
      from_year: 1991,
      to_year: 1991,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().searchParams.get('from')).toBe('01-1991');
  });

  it('fails year_out_of_range for a year after the current one, with no request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    catchAllRequests();
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'national',
      from_year: 2026,
      to_year: 2027,
    });
    expectReason(result, 'year_out_of_range', JsonRpcErrorCode.ValidationError);
    expect(text(result)).toContain('Use years from 1991 through 2026.');
    expect(http.calls).toHaveLength(0);
  });

  it('fails invalid_date_range for a reversed range, with no request', async () => {
    catchAllRequests();
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'national',
      from_year: 2023,
      from_month: 6,
      to_year: 2023,
      to_month: 5,
    });
    expectReason(result, 'invalid_date_range', JsonRpcErrorCode.ValidationError);
    expect(http.calls).toHaveLength(0);
  });

  it('fails scope_param_missing and scope_param_incompatible with no request', async () => {
    catchAllRequests();
    expectReason(
      await runToolContract(fbiGetHateCrimes, { scope: 'agency', ...year2023 }),
      'scope_param_missing',
      JsonRpcErrorCode.ValidationError,
    );
    expectReason(
      await runToolContract(fbiGetHateCrimes, { scope: 'national', state_abbr: 'TX', ...year2023 }),
      'scope_param_incompatible',
      JsonRpcErrorCode.ValidationError,
    );
    expect(http.calls).toHaveLength(0);
  });
});

describe('fbi_get_hate_crimes zeros, nulls, and malformed payloads', () => {
  it('an all-zero agency payload succeeds with zeros intact and an identifier-first notice', async () => {
    reply('/hate-crime/agency/ZZ0000000/all', capture('hate-agency-unknown-2023'));
    const result = await runToolContract(fbiGetHateCrimes, {
      scope: 'agency',
      ori: 'ZZ0000000',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as unknown as HatePayload & { notice: string };
    expect(structured.incident_section.bias_category).toMatchObject({ Religion: 0 });
    expect(structured.notice).toContain('fbi_search_agencies');
    expect(structured.notice).toContain('does not recognize the ORI');
    expect(text(result)).toContain(structured.notice);
    expect(text(result)).toContain('| Religion | 0 |');
    expect(text(result)).not.toContain('| Religion | — |');
  });

  it('an all-zero national payload carries a notice without identifier advice', async () => {
    reply('/hate-crime/national/all', capture('hate-agency-unknown-2023'));
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    const notice = (result.structuredContent as { notice?: string }).notice;
    expect(notice).toMatch(/^Every count is zero/);
    expect(notice).not.toContain('recognize');
    expect(notice).not.toContain('fbi_search_agencies');
    expect(text(result)).toContain(notice as string);
  });

  it('a single non-zero count suppresses the zero notice', async () => {
    const payload = capture('hate-agency-unknown-2023');
    payload.bias_section.location_type = { ...payload.bias_section.location_type, Zoo: 1 };
    reply('/hate-crime/national/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).not.toHaveProperty('notice');
  });

  it('relays a null count as null and renders it as unavailable', async () => {
    const payload = capture('hate-national-2023');
    payload.incident_section.bias_category = {
      ...payload.incident_section.bias_category,
      Gender: null,
    };
    delete payload.last_refresh_date;
    reply('/hate-crime/national/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      incident_section: { bias_category: { Gender: null, Religion: 2769 } },
    });
    expect(result.structuredContent).not.toHaveProperty('data_last_updated');
    expect(text(result)).toContain('| Gender | — |');
    expect(text(result)).not.toContain('Data last updated');
  });

  it('renders an empty dimension as an explicit line rather than an empty table', async () => {
    const payload = capture('hate-national-2023');
    payload.bias_section.judicial_district = {};
    reply('/hate-crime/national/all', payload);
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
    expect(result.structuredContent).toMatchObject({ bias_section: { judicial_district: {} } });
    expect(text(result)).toMatch(/### Judicial district\nCDE returned no categories/);
  });

  const malformed: [string, (payload: HatePayload) => void][] = [
    ['missing section', (p) => Reflect.deleteProperty(p, 'incident_section')],
    ['missing dimension', (p) => Reflect.deleteProperty(p.bias_section, 'offender_race')],
    ['null dimension', (p) => Object.assign(p.bias_section, { offense_type: null })],
    ['string count', (p) => Object.assign(p.incident_section, { bias: { 'Anti-Arab': '5' } })],
  ];
  for (const [label, mutate] of malformed) {
    it(`fails a ${label} payload as malformed upstream data, never no_data`, async () => {
      const payload = capture('hate-national-2023');
      mutate(payload);
      reply('/hate-crime/national/all', payload);
      const result = await runToolContract(fbiGetHateCrimes, { scope: 'national', ...year2023 });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.SerializationError },
      });
      expect(text(result)).toContain('Malformed FBI hate-crime response');
      expect(text(result)).not.toContain('no_data');
    });
  }
});
