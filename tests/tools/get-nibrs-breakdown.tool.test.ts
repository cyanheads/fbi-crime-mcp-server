/**
 * @fileoverview Tests for fbi_get_nibrs_breakdown through the real CDE service and captured payloads.
 * @module tests/tools/get-nibrs-breakdown.tool.test
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
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const origin = 'https://cde.example.test';
const year2023 = { from_year: 2023, to_year: 2023 };

type Counts = Record<string, number | null>;
interface NibrsPayload {
  cde_properties?: {
    last_refresh_date?: Record<string, string>;
    max_data_date?: Record<string, string>;
  };
  offender: Record<string, Counts>;
  offense: Record<string, Counts>;
  victim: Record<string, Counts>;
}
type Result = Awaited<ReturnType<typeof runToolContract>>;

/** CDE section name → the output field that relays it. */
const SECTIONS = [
  ['victim', 'victim'],
  ['offender', 'offender'],
  ['offense', 'offense_details'],
] as const;

/** Every table content[] renders, in order: CDE section, dimension, and its `### ` heading. */
const TABLES = [
  ['victim', 'age', 'Victim age'],
  ['victim', 'sex', 'Victim sex'],
  ['victim', 'race', 'Victim race'],
  ['victim', 'location', 'Victim location'],
  ['victim', 'ethnicity', 'Victim ethnicity'],
  ['victim', 'relationship', 'Victim relationship to offender'],
  ['offender', 'age', 'Offender age'],
  ['offender', 'sex', 'Offender sex'],
  ['offender', 'race', 'Offender race'],
  ['offender', 'ethnicity', 'Offender ethnicity'],
  ['offense', 'weapons', 'Weapons'],
  ['offense', 'related_offenses', 'Related offenses'],
] as const;

function capture(name: string): NibrsPayload {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'),
  ) as NibrsPayload;
}

/** The same category skeleton with every count set to `value`. */
function filled(payload: NibrsPayload, value: number | null): NibrsPayload {
  const fill = (section: Record<string, Counts>) =>
    Object.fromEntries(
      Object.entries(section).map(([dimension, counts]) => [
        dimension,
        Object.fromEntries(Object.keys(counts).map((category) => [category, value])),
      ]),
    );
  return {
    ...payload,
    victim: fill(payload.victim),
    offender: fill(payload.offender),
    offense: fill(payload.offense),
  };
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

/** Answer one CDE path for one view (`totals` or `counts`). */
function replyView(path: string, view: 'totals' | 'counts', payload: unknown): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return (
        url.origin === origin && url.pathname === path && url.searchParams.get('type') === view
      );
    },
    respond: Response.json(payload),
  });
}

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'));
}

function requestUrl(): URL {
  const call = http.calls[0];
  if (!call) throw new Error('no fetch was made');
  return new URL(call.request.url);
}

/** Every request made, as `path?type&from&to`, sorted. */
function requests(): string[] {
  return http.calls
    .map((call) => {
      const url = new URL(call.request.url);
      const query = ['type', 'from', 'to'].map((key) => url.searchParams.get(key)).join('&');
      return `${url.pathname}?${query}`;
    })
    .sort();
}

function expectReason(result: Result, reason: string, code: number): void {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code, data: { reason } } });
  expect(text(result)).toContain(reason);
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
  expect(text(result)).toContain(field);
  expect(http.calls).toHaveLength(0);
}

/** The `Codes:` listing in a selector description, as its codes in listed order. */
function listedCodes(description: string | undefined): string[] {
  const listing = description?.split('Codes: ')[1]?.replace(/\.$/, '');
  if (!listing) throw new Error('description has no Codes: listing');
  return listing.split('; ').map((entry) => entry.slice(0, entry.indexOf(' ')));
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
 * Every dimension appears in structuredContent with its categories in CDE's order, and as its own
 * table in content[] whose rows are exactly its categories in that order.
 */
function expectEveryCategory(result: Result, payload: NibrsPayload): void {
  const structured = result.structuredContent as unknown as Record<string, Record<string, Counts>>;
  const body = text(result);
  for (const [section, field] of SECTIONS) {
    expect(Object.keys(structured[field] ?? {})).toEqual(Object.keys(payload[section]));
  }
  expect(body.split('\n').filter((line) => line.startsWith('### '))).toEqual(
    TABLES.map(([, , heading]) => `### ${heading}`),
  );
  let cells = 0;
  for (const [section, dimension, heading] of TABLES) {
    const field = section === 'offense' ? 'offense_details' : section;
    const counts = payload[section][dimension];
    if (!counts) throw new Error(`payload has no ${section}.${dimension}`);
    expect(Object.entries(structured[field]?.[dimension] ?? {})).toEqual(Object.entries(counts));
    const expected = Object.entries(counts).map(([category, count]) => {
      const label = category.replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&');
      return `| ${label} | ${count === null ? '—' : count.toLocaleString('en-US')} |`;
    });
    expect(tableRows(body, heading), heading).toEqual(expected);
    cells += expected.length;
  }
  expect(cells).toBe(261);
}

describe('fbi_get_nibrs_breakdown scopes', () => {
  it('national scope relays every CDE category with type=totals and MM-YYYY bounds', async () => {
    const payload = capture('nibrs-national-13a-2023');
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(http.calls).toHaveLength(1);
    const url = requestUrl();
    expect(url.searchParams.get('type')).toBe('totals');
    expect(url.searchParams.get('from')).toBe('01-2023');
    expect(url.searchParams.get('to')).toBe('12-2023');
    expect(result.structuredContent).toMatchObject({
      scope: 'national',
      offense: '13A',
      offense_label: 'Aggravated Assault',
      from: '01-2023',
      to: '12-2023',
      data_last_updated: '10/15/2026',
      max_data_date: '10/2026',
      victim: { sex: { Male: 418190, Female: 352829, 'Not Specified': 0 } },
      offender: { sex: { Male: 486652, 'Not Specified': 67175 } },
      offense_details: { weapons: { Rifle: 13138 }, related_offenses: { Arson: 736 } },
    });
    expect(result.structuredContent).not.toHaveProperty('state_abbr');
    expect(result.structuredContent).not.toHaveProperty('ori');
    expectEveryCategory(result, payload);
    const body = text(result);
    expect(body).toContain('## FBI NIBRS Breakdown — National');
    expect(body).toContain('**Offense:** 13A (Aggravated Assault) | **Range:** 01-2023 → 12-2023');
    expect(body).toContain('**Data last updated:** 10/15/2026');
    expect(body).toContain('**Max data date:** 10/2026');
    expect(body).toContain('### Victim relationship to offender');
    expect(body).toContain('### Offender ethnicity');
    expect(body).toContain('### Related offenses');
    expect(body).toContain('do not sum to one total');
    expect(body).toContain('| Rifle \\(Automatic\\) |');
    expect(body).toContain('| Hotel/Motel/Etc\\. |');
  });

  it('state scope uppercases the abbreviation into the path and echo', async () => {
    const payload = capture('nibrs-state-tx-13a-2023');
    reply('/nibrs/state/TX/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'state',
      state_abbr: 'tx',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'state',
      state_abbr: 'TX',
      victim: { sex: { Male: 47664, Female: 39230 } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('## FBI NIBRS Breakdown — TX');
    expect(text(result)).toContain('**Scope:** state | **State:** TX');
  });

  it('agency scope uppercases the ORI into the path and echo', async () => {
    const payload = capture('nibrs-agency-txspd0000-13a-2023');
    reply('/nibrs/agency/TXSPD0000/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'txspd0000',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      scope: 'agency',
      ori: 'TXSPD0000',
      offender: { sex: { Male: 3771, Female: 1071 } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('**Scope:** agency | **ORI:** TXSPD0000');
  });
});

describe('fbi_get_nibrs_breakdown offense selector', () => {
  it('sends the offense code as the path segment and echoes its CDE label', async () => {
    const payload = capture('nibrs-national-120-2015-2025');
    reply('/nibrs/national/120', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '120',
      from_year: 2015,
      to_year: 2025,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().searchParams.get('to')).toBe('12-2025');
    expect(result.structuredContent).toMatchObject({
      offense: '120',
      offense_label: 'Robbery',
      victim: { sex: { Male: 965309 } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('**Offense:** 120 (Robbery)');
  });

  it('normalizes a lowercase code to the CDE code before the request', async () => {
    reply('/nibrs/national/13A', capture('nibrs-national-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13a' as '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().pathname).toBe('/nibrs/national/13A');
    expect(result.structuredContent).toMatchObject({ offense: '13A' });
  });

  it('advertises the 71 codes that return data, each mapped to its label, with no all', () => {
    const offense = fbiGetNibrsBreakdown.input.shape.offense;
    const values = offense.out.options;
    expect(values).toHaveLength(71);
    expect(values).toEqual(expect.arrayContaining(['13A', '120', '09A', '35A', '720', '23H']));
    expect(values).not.toContain('all');
    expect(values).not.toContain('23*');
    expect([...listedCodes(offense.description)].sort()).toEqual([...values].sort());
    expect(offense.description).toContain('13A Aggravated Assault');
    expect(offense.description).toContain('120 Robbery');
    expect(offense.description).toContain('35A Drug/Narcotic Violations');
    expect(offense.description).toContain('26E Wire Fraud');
  });

  it('requires offense, failing before any request', async () => {
    catchAllRequests();
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      ...year2023,
    } as never);
    expectFieldRejected(result, 'offense');
  });

  for (const offense of ['23*', 'all', '999', 'robbery', 'Aggravated Assault', '']) {
    it(`rejects offense ${JSON.stringify(offense)} before any request`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetNibrsBreakdown, {
        scope: 'national',
        offense: offense as '13A',
        ...year2023,
      });
      expectFieldRejected(result, 'offense');
    });
  }
});

describe('fbi_get_nibrs_breakdown input contract', () => {
  for (const field of ['from_year', 'to_year'] as const) {
    it(`rejects ${field} 1990 in the schema without fetching`, async () => {
      catchAllRequests();
      const result = await runToolContract(fbiGetNibrsBreakdown, {
        scope: 'national',
        offense: '13A',
        from_year: 1991,
        to_year: 1991,
        [field]: 1990,
      });
      expectFieldRejected(result, field);
      expect(text(result)).toContain('1991');
    });
  }

  it('accepts the 1991 floor', async () => {
    reply('/nibrs/national/13A', capture('nibrs-national-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
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
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      from_year: 2026,
      to_year: 2027,
    });
    expectReason(result, 'year_out_of_range', JsonRpcErrorCode.ValidationError);
    expect(text(result)).toContain('Use years from 1991 through 2026.');
    expect(http.calls).toHaveLength(0);
  });

  it('fails invalid_date_range for a reversed range, with no request', async () => {
    catchAllRequests();
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
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
      await runToolContract(fbiGetNibrsBreakdown, {
        scope: 'state',
        offense: '13A',
        ...year2023,
      }),
      'scope_param_missing',
      JsonRpcErrorCode.ValidationError,
    );
    expectReason(
      await runToolContract(fbiGetNibrsBreakdown, {
        scope: 'national',
        ori: 'TXSPD0000',
        offense: '13A',
        ...year2023,
      }),
      'scope_param_incompatible',
      JsonRpcErrorCode.ValidationError,
    );
    expect(http.calls).toHaveLength(0);
  });
});

describe('fbi_get_nibrs_breakdown include_monthly', () => {
  type MonthlyRow = Record<string, number | null>;
  const monthlyOf = (result: Result) =>
    (result.structuredContent as { monthly?: MonthlyRow[] }).monthly ?? [];
  const sum = (rows: MonthlyRow[], field: string) =>
    rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const sapd = '/nibrs/agency/TXSPD0000';

  it('omitted returns no monthly', async () => {
    reply('/nibrs/national/13A', capture('nibrs-national-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(requests()).toEqual(['/nibrs/national/13A?totals&01-2023&12-2023']);
    expect(result.structuredContent).not.toHaveProperty('monthly');
  });

  it('true adds the offense and clearance counts the totals view lacks', async () => {
    replyView(`${sapd}/23C`, 'totals', capture('nibrs-agency-txspd0000-23c-2024'));
    replyView(`${sapd}/23C`, 'counts', fixture('counts-nibrs-agency-txspd0000-23c-2024'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'TXSPD0000',
      offense: '23C',
      include_monthly: true,
      from_year: 2024,
      to_year: 2024,
    });
    expect(result.isError).not.toBe(true);
    expect(requests()).toEqual([
      `${sapd}/23C?counts&01-2024&12-2024`,
      `${sapd}/23C?totals&01-2024&12-2024`,
    ]);
    const monthly = monthlyOf(result);
    expect(monthly).toHaveLength(12);
    expect(sum(monthly, 'actual_count')).toBe(13295);
    expect(sum(monthly, 'clearance_count')).toBe(3053);
    expect(monthly[2]).toEqual({
      year: 2024,
      month: 3,
      actual_count: 1072,
      clearance_count: 271,
      rate_per_100k: 70.78,
      clearance_rate_per_100k: 17.89,
      population: 1514458,
      participated_population: 1514458,
      population_coverage_percent: null,
    });
    const body = text(result);
    expect(body.split('\n').filter((line) => line.startsWith('### '))).toEqual([
      ...TABLES.map(([, , heading]) => `### ${heading}`),
      '### Monthly counts',
    ]);
    expect(body).toContain(
      '| 2024 | 03 | 1,072 | 271 | 70.78 | 17.89 | 1,514,458 | 1,514,458 | — |',
    );
  });

  it("marks the months before an agency's NIBRS start: -1 rates null, populations null", async () => {
    replyView(`${sapd}/13A`, 'totals', fixture('nibrs-agency-txspd0000-13a-2020'));
    replyView(`${sapd}/13A`, 'counts', fixture('counts-nibrs-agency-txspd0000-13a-2020'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'TXSPD0000',
      offense: '13A',
      include_monthly: true,
      from_year: 2020,
      to_year: 2020,
    });
    expect(result.isError).not.toBe(true);
    // The totals view sums 1,169 victims with no sign they all fall in November and December.
    expect(result.structuredContent).toMatchObject({
      victim: { sex: { Male: 633, Female: 523, Unknown: 13 } },
    });
    const monthly = monthlyOf(result);
    expect(monthly.slice(0, 10).every((row) => row.actual_count === 0)).toBe(true);
    expect(monthly.slice(10).map((row) => row.actual_count)).toEqual([621, 548]);
    expect(monthly.filter((row) => row.rate_per_100k === null)).toHaveLength(9);
    expect(monthly.filter((row) => row.participated_population === null)).toHaveLength(9);
    expect(monthly[7]).toMatchObject({
      month: 8,
      rate_per_100k: 0,
      participated_population: 1573189,
    });
    expect(text(result)).toContain('| 2020 | 01 | 0 | 0 | — | — | 1,573,189 | — | — |');
    expect(text(result)).not.toContain('| -1 |');
  });

  it('an all-null totals payload still fails no_data with include_monthly', async () => {
    replyView('/nibrs/agency/QQ0000000/13A', 'totals', capture('nibrs-agency-unknown-13a-2023'));
    replyView(
      '/nibrs/agency/QQ0000000/13A',
      'counts',
      fixture('counts-nibrs-agency-unknown-13a-2023'),
    );
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'QQ0000000',
      offense: '13A',
      include_monthly: true,
      ...year2023,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
  });

  it('returns an empty monthly, said in text, when the counts view names no series', async () => {
    replyView(`${sapd}/13A`, 'totals', capture('nibrs-agency-txspd0000-13a-2023'));
    replyView(`${sapd}/13A`, 'counts', fixture('counts-nibrs-agency-unknown-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'TXSPD0000',
      offense: '13A',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      victim: { sex: { Male: 3986, Female: 2949 } },
      monthly: [],
    });
    expect(text(result)).toMatch(
      /### Monthly counts\nCDE sent no monthly series for this state or ORI\./,
    );
  });

  it('fails a counts payload without its offenses series as malformed upstream data', async () => {
    replyView('/nibrs/national/13A', 'totals', capture('nibrs-national-13a-2023'));
    replyView('/nibrs/national/13A', 'counts', { populations: null });
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.SerializationError },
    });
    expect(text(result)).toContain('Malformed FBI nibrs counts response');
  });

  it('a totals 404 stops the counts leg mid-retry and surfaces the 404', async () => {
    vi.useFakeTimers();
    for (const [view, status] of [
      ['totals', 404],
      ['counts', 500],
    ] as const) {
      http.route({
        match: (request) => {
          const url = new URL(request.url);
          return (
            url.origin === origin &&
            url.pathname === '/nibrs/national/13A' &&
            url.searchParams.get('type') === view
          );
        },
        respond: new Response('upstream text', { status }),
      });
    }
    const pending = runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      include_monthly: true,
      ...year2023,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.NotFound, data: { status: 404 } },
    });
    expect(requests()).toEqual([
      '/nibrs/national/13A?counts&01-2023&12-2023',
      '/nibrs/national/13A?totals&01-2023&12-2023',
    ]);
  });
});

describe('fbi_get_nibrs_breakdown nulls, zeros, and malformed payloads', () => {
  it('an all-null agency payload fails no_data, pointing to fbi_search_agencies first', async () => {
    reply('/nibrs/agency/ZZ0000000/13A', capture('nibrs-agency-unknown-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'ZZ0000000',
      offense: '13A',
      ...year2023,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    expect(http.calls).toHaveLength(1);
    const body = text(result);
    expect(body).toContain(
      'CDE has no NIBRS data for offense 13A (Aggravated Assault) for agency ZZ0000000, 01-2023 to 12-2023; its data runs through 10/2026.',
    );
    expect(body).toContain('fbi_search_agencies');
    expect(result.structuredContent).toMatchObject({
      error: { data: { recovery: { hint: expect.stringMatching(/^Confirm the ORI/) } } },
    });
  });

  it('a known NIBRS agency with no incidents of the offense fails no_data, naming that cause', async () => {
    // Live 2023: San Antonio PD (TXSPD0000) reported no Treason (101); CDE sends the all-null shape.
    reply('/nibrs/agency/TXSPD0000/101', capture('nibrs-agency-unknown-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'TXSPD0000',
      offense: '101',
      ...year2023,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    expect(http.calls).toHaveLength(1);
    expect(text(result)).toContain('101 (Treason)');
    expect(result.structuredContent).toMatchObject({
      error: {
        data: { recovery: { hint: expect.stringContaining('no incidents of this offense') } },
      },
    });
    expect(text(result)).toContain('no incidents of this offense');
  });

  it('an agency no_data never asserts no incidents: unsubmitted months return the same nulls', async () => {
    // Live 2026-11-16: TXSPD0000 (NIBRS since 2020-11-01) 13A for 11-2026 returns the all-null
    // shape, while its arrest monthly rows show November not yet submitted.
    reply('/nibrs/agency/TXSPD0000/13A', capture('nibrs-agency-unknown-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'agency',
      ori: 'TXSPD0000',
      offense: '13A',
      from_year: 2026,
      from_month: 11,
      to_year: 2026,
      to_month: 11,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    const hint = (result.structuredContent as { error: { data: { recovery: { hint: string } } } })
      .error.data.recovery.hint;
    expect(hint).not.toContain('it recorded no incidents');
    expect(hint).toContain('not submitted');
    expect(hint).toContain('fbi_get_arrests');
    expect(hint).toContain('include_monthly');
    expect(text(result)).toContain(hint);
  });

  it('an all-null state payload points to state_abbr, not the agency directory', async () => {
    const payload = filled(capture('nibrs-state-tx-13a-2023'), null);
    reply('/nibrs/state/ZZ/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'state',
      state_abbr: 'ZZ',
      offense: '13A',
      ...year2023,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    expect(text(result)).toContain('for state ZZ, 01-2023 to 12-2023');
    expect(text(result)).toContain('state_abbr');
    expect(text(result)).toContain('no reported incidents of this offense');
    expect(text(result)).not.toContain('fbi_search_agencies');
  });

  it('an all-null national payload fails no_data with window advice and no identifier advice', async () => {
    const payload = capture('nibrs-agency-unknown-13a-2023');
    delete payload.cde_properties;
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    expect(text(result)).toContain(
      'CDE has no NIBRS data for offense 13A (Aggravated Assault) for the nation, 01-2023 to 12-2023.',
    );
    expect(text(result)).not.toContain('its data runs through');
    expect(text(result)).toContain('try a wider window that ends by that month');
    expect(text(result)).toContain('no reported incidents of this offense');
    expect(text(result)).not.toContain('fbi_search_agencies');
    expect(text(result)).not.toContain('state_abbr');
  });

  it('a window after the latest CDE data month is not read as no incidents, nor advised to move later', async () => {
    // Live 2026-11-16: national 13A for 12-2026 returns the all-null shape while CDE's data runs
    // through 11/2026. The fixture's data runs through 10/2026.
    reply('/nibrs/national/13A', capture('nibrs-agency-unknown-13a-2023'));
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      from_year: 2026,
      from_month: 11,
      to_year: 2026,
      to_month: 12,
    });
    expectReason(result, 'no_data', JsonRpcErrorCode.NotFound);
    const hint = (result.structuredContent as { error: { data: { recovery: { hint: string } } } })
      .error.data.recovery.hint;
    expect(text(result)).toContain('11-2026 to 12-2026; its data runs through 10/2026.');
    expect(hint).toContain('after its latest data month');
    expect(hint).not.toContain('later');
    expect(hint).not.toContain('were reported');
    expect(text(result)).toContain(hint);
  });

  it('a partly-null payload is data: nulls relayed as null and rendered as unavailable', async () => {
    const payload = filled(capture('nibrs-national-13a-2023'), null);
    payload.offense.weapons = { ...payload.offense.weapons, Rifle: 12 };
    payload.victim.sex = { ...payload.victim.sex, Female: 0 };
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      victim: { sex: { Male: null, Female: 0 } },
      offense_details: { weapons: { Rifle: 12, Poison: null } },
    });
    expectEveryCategory(result, payload);
    expect(text(result)).toContain('| Male | — |');
    expect(text(result)).toContain('| Female | 0 |');
  });

  it('an all-zero payload is data, with zeros kept as 0', async () => {
    const payload = filled(capture('nibrs-national-13a-2023'), 0);
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ victim: { sex: { Male: 0 } } });
    expect(text(result)).toContain('| Male | 0 |');
    expect(text(result)).not.toContain('| Male | — |');
  });

  it('omits the data dates on both surfaces when CDE sends no cde_properties', async () => {
    const payload = capture('nibrs-national-13a-2023');
    delete payload.cde_properties;
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).not.toHaveProperty('data_last_updated');
    expect(result.structuredContent).not.toHaveProperty('max_data_date');
    expect(text(result)).not.toContain('Data last updated');
    expect(text(result)).not.toContain('Max data date');
  });

  it('renders an empty dimension as an explicit line rather than an empty table', async () => {
    const payload = capture('nibrs-national-13a-2023');
    payload.offense.related_offenses = {};
    reply('/nibrs/national/13A', payload);
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      scope: 'national',
      offense: '13A',
      ...year2023,
    });
    expect(result.structuredContent).toMatchObject({ offense_details: { related_offenses: {} } });
    expect(text(result)).toMatch(/### Related offenses\nCDE returned no categories/);
  });

  const malformed: [string, (payload: NibrsPayload) => void][] = [
    ['missing section', (p) => Reflect.deleteProperty(p, 'offender')],
    ['missing dimension', (p) => Reflect.deleteProperty(p.victim, 'relationship')],
    ['null dimension', (p) => Object.assign(p.offense, { weapons: null })],
    ['string count', (p) => Object.assign(p.victim, { sex: { Male: '5' } })],
  ];
  for (const [label, mutate] of malformed) {
    it(`fails a ${label} payload as malformed upstream data, never no_data`, async () => {
      const payload = capture('nibrs-national-13a-2023');
      mutate(payload);
      reply('/nibrs/national/13A', payload);
      const result = await runToolContract(fbiGetNibrsBreakdown, {
        scope: 'national',
        offense: '13A',
        ...year2023,
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.SerializationError },
      });
      expect(text(result)).toContain('Malformed FBI nibrs response');
      expect(text(result)).not.toContain('no_data');
    });
  }
});
