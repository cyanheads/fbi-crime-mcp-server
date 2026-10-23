/**
 * @fileoverview Tests for fbi_get_arrests through the real CDE service and captured payloads.
 * @module tests/tools/get-arrests.tool.test
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
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const origin = 'https://cde.example.test';
const year2023 = { from_year: 2023, to_year: 2023 };

type Counts = Record<string, number | null>;
type ArrestPayload = Record<string, Counts> & {
  cde_properties?: {
    last_refresh_date?: Record<string, string>;
    max_data_date?: Record<string, string>;
  };
};
type Result = Awaited<ReturnType<typeof runToolContract>>;

/** Every table content[] renders, in order: CDE group, its output field, and its `### ` heading. */
const GROUPS = [
  ['Offense Name', 'offense_name', 'Arrests by offense name'],
  ['Offense Category', 'offense_category', 'Arrests by offense category'],
  ['Offense Breakdown', 'offense_breakdown', 'Arrests by offense breakdown'],
  ['Arrestee Sex', 'arrestee_sex', 'Arrests by arrestee sex'],
  ['Arrestee Race', 'arrestee_race', 'Arrests by arrestee race'],
  ['Male Arrests By Age', 'male_arrests_by_age', 'Male arrests by age'],
  ['Female Arrests By Age', 'female_arrests_by_age', 'Female arrests by age'],
] as const;

function capture(name: string): ArrestPayload {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'),
  ) as ArrestPayload;
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
 * Every CDE group appears in structuredContent with its categories in CDE's order, and as its own
 * table in content[] whose rows are exactly its categories in that order.
 */
function expectEveryCategory(result: Result, payload: ArrestPayload): void {
  const structured = result.structuredContent as Record<string, Counts>;
  const body = text(result);
  expect(body.split('\n').filter((line) => line.startsWith('### '))).toEqual(
    GROUPS.map(([, , heading]) => `### ${heading}`),
  );
  let cells = 0;
  for (const [group, field, heading] of GROUPS) {
    const counts = payload[group];
    if (!counts) throw new Error(`payload has no ${group}`);
    expect(Object.entries(structured[field] ?? {})).toEqual(Object.entries(counts));
    const expected = Object.entries(counts).map(([category, count]) => {
      const label = category.replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&');
      return `| ${label} | ${count === null ? '—' : count.toLocaleString('en-US')} |`;
    });
    expect(tableRows(body, heading), heading).toEqual(expected);
    cells += expected.length;
  }
  expect(cells).toBe(175);
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

describe('fbi_get_arrests scopes', () => {
  it('national scope relays every CDE group with type=totals and MM-YYYY bounds', async () => {
    const payload = capture('arrest-national-2023');
    reply('/arrest/national/all', payload);
    const result = await runToolContract(fbiGetArrests, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(http.calls).toHaveLength(1);
    const url = requestUrl();
    expect(url.searchParams.get('type')).toBe('totals');
    expect(url.searchParams.get('from')).toBe('01-2023');
    expect(url.searchParams.get('to')).toBe('12-2023');
    expect(result.structuredContent).toMatchObject({
      scope: 'national',
      offense: 'all',
      offense_label: 'All offenses',
      from: '01-2023',
      to: '12-2023',
      data_last_updated: '10/15/2026',
      max_data_date: '10/2026',
      offense_name: { Robbery: 65336, Rape: 0 },
      arrestee_sex: { Male: 5154454, Female: 1922876 },
    });
    expect(result.structuredContent).not.toHaveProperty('notice');
    expect(result.structuredContent).not.toHaveProperty('total');
    expectEveryCategory(result, payload);
    const body = text(result);
    expect(body).toContain('## FBI Arrests — National');
    expect(body).toContain('**Offense:** all (All offenses)');
    expect(body).toContain('**Data last updated:** 10/15/2026');
    expect(body).toContain('**Max data date:** 10/2026');
    expect(body).toContain('### Arrests by arrestee sex');
    expect(body).toContain('### Female arrests by age');
    expect(body).toContain('do not sum to one total');
    expect(body).toContain('| Male | 5,154,454 |');
  });

  it('state scope uppercases the abbreviation into the path and echo', async () => {
    const payload = capture('arrest-state-tx-2023');
    reply('/arrest/state/TX/all', payload);
    const result = await runToolContract(fbiGetArrests, {
      scope: 'state',
      state_abbr: 'tx',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'state',
      state_abbr: 'TX',
      offense_name: { Robbery: 5038 },
      arrestee_sex: { Male: 425064, Female: 150729 },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('## FBI Arrests — TX');
  });

  it('agency scope uppercases the ORI into the path and echo', async () => {
    const payload = capture('arrest-agency-txspd0000-2023');
    reply('/arrest/agency/TXSPD0000/all', payload);
    const result = await runToolContract(fbiGetArrests, {
      scope: 'agency',
      ori: 'txspd0000',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'agency',
      ori: 'TXSPD0000',
      offense_name: { Robbery: 276 },
      arrestee_sex: { Male: 28898, Female: 10551 },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('**Scope:** agency | **ORI:** TXSPD0000');
  });
});

describe('fbi_get_arrests offense selector', () => {
  it('sends an offense code as the path segment and echoes its CDE label', async () => {
    reply('/arrest/national/30', capture('arrest-national-robbery30-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '30',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      offense: '30',
      offense_label: 'Robbery',
      offense_name: { Robbery: 65336, Arson: 0 },
      arrestee_sex: { Male: 55163, Female: 10173 },
    });
    expect(text(result)).toContain('**Offense:** 30 (Robbery)');
  });

  it('advertises all plus the CDE codes, each mapped to its label in the description', () => {
    const offense = fbiGetArrests.input.shape.offense;
    const values = offense.unwrap().options;
    expect(values).toHaveLength(47);
    expect(values).toContain('all');
    expect(values).toContain('30');
    expect(values).toContain('310');
    expect(values).not.toContain('13A');
    expect(listedCodes(offense.description)).toEqual(values.filter((value) => value !== 'all'));
    expect(offense.description).toContain('30 Robbery');
    expect(offense.description).toContain('11 Murder and Nonnegligent Homicide');
    expect(offense.description).toContain('230 Weapons: Carrying, Possessing, Etc.');
  });

  for (const offense of ['robbery', '999', '13A', '23']) {
    it(`rejects offense ${JSON.stringify(offense)} before any request`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetArrests, {
        scope: 'national',
        offense: offense as '30',
        ...year2023,
      });
      expectFieldRejected(result, 'offense');
    });
  }
});

describe('fbi_get_arrests input contract', () => {
  for (const field of ['from_year', 'to_year'] as const) {
    it(`rejects ${field} 1984 in the schema without fetching`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetArrests, {
        scope: 'national',
        from_year: 1985,
        to_year: 1985,
        [field]: 1984,
      });
      expectFieldRejected(result, field);
      expect(text(result)).toContain('1985');
    });
  }

  it('accepts the 1985 floor', async () => {
    reply('/arrest/national/all', capture('arrest-national-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      from_year: 1985,
      to_year: 1985,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().searchParams.get('from')).toBe('01-1985');
  });

  it('fails year_out_of_range for a year after the current one, with no request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    catchAllRequests();
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      from_year: 2027,
      to_year: 2027,
    });
    expectReason(result, 'year_out_of_range', JsonRpcErrorCode.ValidationError);
    expect(text(result)).toContain('Use years from 1985 through 2026.');
    expect(http.calls).toHaveLength(0);
  });

  it('fails invalid_date_range for a reversed range, with no request', async () => {
    catchAllRequests();
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      from_year: 2023,
      to_year: 2022,
    });
    expectReason(result, 'invalid_date_range', JsonRpcErrorCode.ValidationError);
    expect(http.calls).toHaveLength(0);
  });

  it('fails scope_param_missing and scope_param_incompatible with no request', async () => {
    catchAllRequests();
    expectReason(
      await runToolContract(fbiGetArrests, { scope: 'state', ...year2023 }),
      'scope_param_missing',
      JsonRpcErrorCode.ValidationError,
    );
    expectReason(
      await runToolContract(fbiGetArrests, {
        scope: 'state',
        state_abbr: 'TX',
        ori: 'TXSPD0000',
        ...year2023,
      }),
      'scope_param_incompatible',
      JsonRpcErrorCode.ValidationError,
    );
    expect(http.calls).toHaveLength(0);
  });
});

describe('fbi_get_arrests zeros, nulls, and malformed payloads', () => {
  it('an all-zero agency payload succeeds with zeros intact and an identifier-first notice', async () => {
    reply('/arrest/agency/ZZ0000000/all', capture('arrest-agency-unknown-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'agency',
      ori: 'ZZ0000000',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as Record<string, unknown> & { notice: string };
    expect(structured.arrestee_sex).toEqual({ Male: 0, Female: 0 });
    expect(structured.notice).toContain('fbi_search_agencies');
    expect(text(result)).toContain(structured.notice);
    expect(text(result)).toContain('| Male | 0 |');
  });

  it('an all-zero state payload names state_abbr in its notice', async () => {
    reply('/arrest/state/ZZ/all', capture('arrest-agency-unknown-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'state',
      state_abbr: 'ZZ',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    const notice = (result.structuredContent as { notice?: string }).notice;
    expect(notice).toContain('does not recognize the state code');
    expect(notice).toContain('state_abbr');
    expect(notice).not.toContain('fbi_search_agencies');
    expect(text(result)).toContain(notice as string);
  });

  it('a single non-zero count in the last group suppresses the zero notice', async () => {
    const payload = capture('arrest-agency-unknown-2023');
    payload['Female Arrests By Age'] = { ...payload['Female Arrests By Age'], '65 and over': 1 };
    reply('/arrest/national/all', payload);
    const result = await runToolContract(fbiGetArrests, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ female_arrests_by_age: { '65 and over': 1 } });
    expect(result.structuredContent).not.toHaveProperty('notice');
    expect(text(result)).not.toContain('Every count is zero');
  });

  it('relays a null count as null, omits absent CDE dates, and renders unavailable', async () => {
    const payload = capture('arrest-national-2023');
    payload['Arrestee Race'] = { ...payload['Arrestee Race'], Asian: null };
    delete payload.cde_properties;
    reply('/arrest/national/all', payload);
    const result = await runToolContract(fbiGetArrests, { scope: 'national', ...year2023 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ arrestee_race: { Asian: null } });
    expect(result.structuredContent).not.toHaveProperty('data_last_updated');
    expect(result.structuredContent).not.toHaveProperty('max_data_date');
    expect(text(result)).toContain('| Asian | — |');
  });

  const malformed: [string, (payload: ArrestPayload) => void][] = [
    ['missing group', (p) => Reflect.deleteProperty(p, 'Arrestee Sex')],
    ['null group', (p) => Object.assign(p, { 'Offense Name': null })],
    ['array group', (p) => Object.assign(p, { 'Male Arrests By Age': [1, 2] })],
    ['string count', (p) => Object.assign(p, { 'Arrestee Sex': { Male: 'many' } })],
  ];
  for (const [label, mutate] of malformed) {
    it(`fails a ${label} payload as malformed upstream data, never no_data`, async () => {
      const payload = capture('arrest-national-2023');
      mutate(payload);
      reply('/arrest/national/all', payload);
      const result = await runToolContract(fbiGetArrests, { scope: 'national', ...year2023 });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.SerializationError },
      });
      expect(text(result)).toContain('Malformed FBI arrest response');
      expect(text(result)).not.toContain('no_data');
    });
  }
});
