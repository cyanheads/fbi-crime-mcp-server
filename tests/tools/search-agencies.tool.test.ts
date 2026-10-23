/**
 * @fileoverview Tests for fbi_search_agencies over the captured CDE agency directory,
 * driven through the real service and the tool contract.
 * @module tests/tools/search-agencies.tool.test
 */

import { readFileSync } from 'node:fs';
import { parseConfig } from '@cyanheads/mcp-ts-core/config';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  createFetchMock,
  createInMemoryStorage,
  runToolContract,
} from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';
import { fbiSearchAgencies } from '@/mcp-server/tools/definitions/search-agencies.tool.js';
import { initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const baseUrl = 'https://cde.example.test';

function capture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/cde/${name}.json`, import.meta.url), 'utf8'));
}

/** Captured `GET /agency/byStateAbbr/TX` (2026-10-22): 1,763 agencies under 329 county keys. */
const txDirectory = capture('agency-directory-tx');

/** Captured DC directory, including an agency with no NIBRS start date (sparse record). */
const dcDirectory = {
  'NOT SPECIFIED': [
    {
      ori: 'DC0011300',
      counties: 'NOT SPECIFIED',
      is_nibrs: false,
      latitude: 38.904103,
      longitude: -77.017229,
      state_abbr: 'DC',
      state_name: 'District of Columbia',
      agency_name:
        'District of Columbia Fire and Emergency Medical Services Arson Investigation Unit',
      agency_type_name: 'Other',
      nibrs_start_date: null,
    },
    {
      ori: 'DCMPD0000',
      counties: 'NOT SPECIFIED',
      is_nibrs: true,
      latitude: 38.894764,
      longitude: -77.015205,
      state_abbr: 'DC',
      state_name: 'District of Columbia',
      agency_name: 'Washington Police Department',
      agency_type_name: 'City',
      nibrs_start_date: '2021-08-01',
    },
    {
      ori: 'DCMTP0000',
      counties: 'NOT SPECIFIED',
      is_nibrs: true,
      latitude: 38.89739,
      longitude: -77.01894,
      state_abbr: 'DC',
      state_name: 'District of Columbia',
      agency_name: 'Metro Transit Police',
      agency_type_name: 'Other',
      nibrs_start_date: '2000-01-01',
    },
  ],
};

/** The not-found envelope CDE answers with HTTP 200 for AS, MP, lowercase, and invented codes. */
const notFoundEnvelope = (state: string) => ({
  cde_agencies_query: {
    counties: null,
    parameters: {
      data_year: null,
      state_abbr: state,
      county_name: '',
      judicial_district_code: null,
    },
    utc_run_time: '2026-10-23T03:49:29.935089',
  },
});

type Result = Awaited<ReturnType<typeof runToolContract>>;
type Agency = {
  ori: string;
  agency_name: string;
  agency_type: string;
  counties: string[];
  is_nibrs: boolean;
  nibrs_start_date?: string;
};
type Page = {
  state_abbr: string;
  total: number;
  offset: number;
  next_offset?: number;
  agencies: Agency[];
  notice?: string;
  truncated?: boolean;
  shown?: number;
  cap?: number;
};

function text(result: Result): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function page(result: Result): Page {
  expect(result.isError, text(result)).not.toBe(true);
  return result.structuredContent as Page;
}

let http: ReturnType<typeof createFetchMock>;

/** Answer one state's directory path; any other request stays unmatched and throws. */
function serveDirectory(state: string, payload: unknown): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return url.origin === baseUrl && url.pathname === `/agency/byStateAbbr/${state}`;
    },
    respond: Response.json(payload),
  });
}

function serveSummarized(ori: string, fixture: string): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return url.origin === baseUrl && url.pathname === `/summarized/agency/${ori}/violent-crime`;
    },
    respond: Response.json(capture(fixture)),
  });
}

/**
 * Route every CDE request, so a request a zero-fetch test forbids is recorded in `http.calls`
 * (createFetchMock rejects unmatched requests without recording them).
 */
function catchAllRequests(): void {
  http.route({
    match: (request) => new URL(request.url).origin === baseUrl,
    respond: Response.json({}),
  });
}

function search(input: Record<string, unknown>, signal?: AbortSignal): Promise<Result> {
  return runToolContract(
    fbiSearchAgencies,
    input as never,
    signal ? { context: { signal } } : undefined,
  );
}

beforeEach(() => {
  http = createFetchMock();
  http.install();
  initFbiApiService(parseConfig(), createInMemoryStorage(), {
    apiKey: 'TEST_KEY',
    baseUrlUcr: baseUrl,
    baseUrlCde: baseUrl,
    requestTimeoutMs: 15000,
  });
});
afterEach(() => {
  http.restore();
});

describe('fbi_search_agencies directory fetch', () => {
  it('returns the whole TX directory total with the first page sorted by name, then ORI', async () => {
    serveDirectory('TX', txDirectory);
    const result = page(await search({ state_abbr: 'TX' }));
    expect(result).toMatchObject({ state_abbr: 'TX', total: 1763, offset: 0, next_offset: 50 });
    expect(result.agencies).toHaveLength(50);
    expect(result.agencies.slice(0, 3).map((a) => a.ori)).toEqual([
      'TX0950100',
      'TX221119E',
      'TX2210100',
    ]);
    expect(result.agencies[0]).toEqual({
      ori: 'TX0950100',
      agency_name: 'Abernathy Police Department',
      agency_type: 'City',
      counties: ['HALE', 'LUBBOCK'],
      is_nibrs: true,
      nibrs_start_date: '2019-11-01',
    });
    expect(result.agencies[49]?.ori).toBe('TX091199E');
    expect(http.calls).toHaveLength(1);
    const url = new URL(http.calls[0]?.request.url ?? '');
    expect(url.pathname).toBe('/agency/byStateAbbr/TX');
    expect([...url.searchParams.keys()]).toEqual(['api_key']);
  });

  it('uppercases state_abbr before the request, so "tx" equals "TX"', async () => {
    serveDirectory('TX', txDirectory);
    const lower = page(await search({ state_abbr: 'tx' }));
    const upper = page(await search({ state_abbr: 'TX' }));
    expect(lower).toEqual(upper);
    expect(lower.state_abbr).toBe('TX');
    expect(http.calls.map((c) => new URL(c.request.url).pathname)).toEqual([
      '/agency/byStateAbbr/TX',
      '/agency/byStateAbbr/TX',
    ]);
  });

  it('lists a multi-county agency once with its split county list', async () => {
    serveDirectory('TX', txDirectory);
    const result = page(await search({ state_abbr: 'TX', name_contains: 'san antonio' }));
    expect(result.agencies.filter((a) => a.ori === 'TXSPD0000')).toEqual([
      {
        ori: 'TXSPD0000',
        agency_name: 'San Antonio Police Department',
        agency_type: 'City',
        counties: ['BEXAR', 'MEDINA'],
        is_nibrs: true,
        nibrs_start_date: '2020-11-01',
      },
    ]);
  });

  it('keeps a null NIBRS start date absent and renders it as unavailable', async () => {
    serveDirectory('DC', dcDirectory);
    const result = await search({ state_abbr: 'DC' });
    const body = page(result);
    expect(body.total).toBe(3);
    expect(body).not.toHaveProperty('next_offset');
    const arson = body.agencies.find((a) => a.ori === 'DC0011300');
    expect(arson).toEqual({
      ori: 'DC0011300',
      agency_name:
        'District of Columbia Fire and Emergency Medical Services Arson Investigation Unit',
      agency_type: 'Other',
      counties: ['NOT SPECIFIED'],
      is_nibrs: false,
    });
    expect(arson).not.toHaveProperty('nibrs_start_date');
    expect(text(result)).toMatch(/\| DC0011300 \|[^\n]*\| No \| — \|/);
    expect(text(result)).toMatch(/\| DCMPD0000 \|[^\n]*\| Yes \| 2021-08-01 \|/);
  });

  it('rejects a malformed directory record as a serialization failure', async () => {
    serveDirectory('TX', { BEXAR: [{ ori: 'TXSPD0000', agency_name: 'San Antonio' }] });
    const result = await search({ state_abbr: 'TX' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.SerializationError },
    });
  });

  it('settles caller cancellation as RequestCancelled after one pending fetch', async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    http.route({
      match: (request) => new URL(request.url).origin === baseUrl,
      respond: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
          started.resolve();
        }),
    });
    const pending = search({ state_abbr: 'TX' }, controller.signal);
    await started.promise;
    controller.abort(new DOMException('Caller cancelled', 'AbortError'));
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.RequestCancelled },
    });
    expect(http.calls).toHaveLength(1);
  });
});

describe('fbi_search_agencies filters', () => {
  it('county matches any entry of the county list, case-insensitively', async () => {
    serveDirectory('TX', txDirectory);
    const result = page(await search({ state_abbr: 'TX', county: 'bexar', limit: 200 }));
    // 42 agencies list BEXAR among their counties; only 36 sit under the bare "BEXAR" key.
    expect(result.total).toBe(42);
    expect(result.agencies).toHaveLength(42);
    expect(result.agencies.map((a) => a.ori)).toContain('TXSPD0000');
    for (const agency of result.agencies) expect(agency.counties).toContain('BEXAR');
    const harris = page(await search({ state_abbr: 'TX', county: ' Harris ' }));
    expect(harris.total).toBe(72);
  });

  it('name_contains requires every token, in any order, case-insensitively', async () => {
    serveDirectory('TX', txDirectory);
    const exact = page(await search({ state_abbr: 'TX', name_contains: 'san antonio police' }));
    expect(exact.total).toBe(1);
    expect(exact.agencies.map((a) => a.ori)).toEqual(['TXSPD0000']);
    const reordered = page(
      await search({ state_abbr: 'TX', name_contains: '  POLICE\tSan\nantonio ' }),
    );
    expect(reordered.agencies.map((a) => a.ori)).toEqual(['TXSPD0000']);
    const broad = page(await search({ state_abbr: 'TX', name_contains: 'san antonio' }));
    expect(broad.total).toBe(6);
  });

  it('agency_type filters to one of the seven observed values', async () => {
    serveDirectory('TX', txDirectory);
    const city = page(await search({ state_abbr: 'TX', agency_type: 'City', limit: 200 }));
    expect(city.total).toBe(780);
    expect(city.agencies).toHaveLength(200);
    for (const agency of city.agencies) expect(agency.agency_type).toBe('City');
    const otherState = page(await search({ state_abbr: 'TX', agency_type: 'Other State Agency' }));
    expect(otherState.total).toBe(1);
  });

  it('combines filters before paging', async () => {
    serveDirectory('TX', txDirectory);
    // Each filter narrows this set: without county 20 match, without agency_type 7, without name_contains 26.
    const result = page(
      await search({
        state_abbr: 'TX',
        county: 'BEXAR',
        agency_type: 'City',
        name_contains: 'san',
        limit: 1,
      }),
    );
    expect(result).toMatchObject({ total: 2, next_offset: 1 });
    expect(result.agencies.map((a) => a.ori)).toEqual(['TXSPD0000']);
    const rest = page(
      await search({
        state_abbr: 'TX',
        county: 'BEXAR',
        agency_type: 'City',
        name_contains: 'san',
        offset: 1,
      }),
    );
    expect(rest.agencies.map((a) => a.ori)).toEqual(['TX0156200']);
    expect(rest).not.toHaveProperty('next_offset');
  });

  it('treats blank optional strings as omitted', async () => {
    serveDirectory('TX', txDirectory);
    for (const blanks of [
      { name_contains: '', county: '', agency_type: '' },
      { name_contains: '   ', county: '  ' },
    ]) {
      const result = page(await search({ state_abbr: 'TX', ...blanks }));
      expect(result.total).toBe(1763);
    }
  });

  it('rejects invalid state codes, agency types, and paging bounds before any fetch', async () => {
    catchAllRequests();
    for (const input of [
      {},
      { state_abbr: 'TEX' },
      { state_abbr: 'T1' },
      { state_abbr: 'TX', agency_type: 'Federal' },
      { state_abbr: 'TX', limit: 0 },
      { state_abbr: 'TX', limit: 201 },
      { state_abbr: 'TX', offset: -1 },
      { state_abbr: 'TX', city: 'Austin' },
    ]) {
      const result = await search(input);
      expect(result.isError, JSON.stringify(input)).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
      });
    }
    expect(http.calls).toHaveLength(0);
  });
});

describe('fbi_search_agencies paging and disclosure', () => {
  it('walks two pages contiguously and discloses truncation on both surfaces', async () => {
    serveDirectory('TX', txDirectory);
    const first = await search({ state_abbr: 'TX' });
    const p1 = page(first);
    const p2 = page(await search({ state_abbr: 'TX', offset: 50 }));
    const both = page(await search({ state_abbr: 'TX', limit: 100 }));
    expect(p2).toMatchObject({ total: 1763, offset: 50, next_offset: 100 });
    expect(p2.agencies[0]?.ori).toBe('TX227289E');
    expect([...p1.agencies, ...p2.agencies].map((a) => a.ori)).toEqual(
      both.agencies.map((a) => a.ori),
    );
    expect(p1).toMatchObject({ truncated: true, shown: 50, cap: 50 });
    expect(p1.notice).toContain('offset: 50');
    const rendered = text(first);
    expect(rendered).toContain('**Total matches:** 1763');
    expect(rendered).toContain('**Next offset:** 50');
    expect(rendered).toContain(p1.notice ?? '');
    expect(rendered).toContain(
      '| TX0950100 | Abernathy Police Department | City | HALE, LUBBOCK | Yes | 2019-11-01 |',
    );
  });

  it('keeps the name-then-ORI order across the whole state', async () => {
    serveDirectory('TX', txDirectory);
    const all: Agency[] = [];
    for (let offset = 0; offset < 1763; offset += 200) {
      all.push(...page(await search({ state_abbr: 'TX', limit: 200, offset })).agencies);
    }
    expect(all).toHaveLength(1763);
    expect(new Set(all.map((a) => a.ori)).size).toBe(1763);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1] as Agency;
      const b = all[i] as Agency;
      const an = a.agency_name.toLowerCase();
      const bn = b.agency_name.toLowerCase();
      expect(an < bn || (an === bn && a.ori < b.ori), `${a.ori} before ${b.ori}`).toBe(true);
    }
  });

  it('orders names case-insensitively and breaks a name tie by ORI, whatever the directory order', async () => {
    // TX lists no duplicate names, so the tie-break is pinned on a directory listing a tie out of ORI order.
    const [template] = dcDirectory['NOT SPECIFIED'];
    const agency = (ori: string, agency_name: string) => ({ ...template, ori, agency_name });
    serveDirectory('DC', {
      'NOT SPECIFIED': [
        agency('DC0000003', 'Guam Police Department'),
        agency('DC0000001', 'Zeta Police'),
        agency('DC0000002', 'GUAM POLICE DEPARTMENT'),
        agency('DC0000004', 'agana Precinct'),
      ],
    });
    const result = page(await search({ state_abbr: 'DC' }));
    expect(result.agencies.map((a) => a.ori)).toEqual([
      'DC0000004',
      'DC0000002',
      'DC0000003',
      'DC0000001',
    ]);
  });

  it('omits next_offset and truncation on the last page', async () => {
    serveDirectory('TX', txDirectory);
    const result = await search({ state_abbr: 'TX', offset: 1750 });
    const last = page(result);
    expect(last).toMatchObject({ total: 1763, offset: 1750 });
    expect(last.agencies).toHaveLength(13);
    expect(last.agencies.at(-1)?.ori).toBe('TX0031100');
    expect(last).not.toHaveProperty('next_offset');
    expect(last).not.toHaveProperty('truncated');
    expect(text(result)).not.toContain('Next offset');
  });

  it('returns no agencies and a notice naming total when offset is past the end', async () => {
    serveDirectory('TX', txDirectory);
    for (const offset of [1763, 5000]) {
      const result = await search({ state_abbr: 'TX', offset });
      const past = page(result);
      expect(past).toMatchObject({ total: 1763, offset, agencies: [] });
      expect(past).not.toHaveProperty('next_offset');
      expect(past.notice).toContain('1763');
      expect(past.notice).toContain(`offset ${offset}`);
      expect(text(result)).toContain(past.notice ?? '');
    }
  });

  it('returns 200 rows at the maximum limit', async () => {
    serveDirectory('TX', txDirectory);
    const result = page(await search({ state_abbr: 'TX', limit: 200 }));
    expect(result.agencies).toHaveLength(200);
    expect(result).toMatchObject({ next_offset: 200, truncated: true, shown: 200, cap: 200 });
  });
});

describe('fbi_search_agencies zero matches', () => {
  it('reports a state with no directory as zero agencies with a notice, not an error', async () => {
    for (const state of ['AS', 'MP', 'ZZ']) {
      serveDirectory(state, notFoundEnvelope(state));
      const result = await search({ state_abbr: state.toLowerCase() });
      const empty = page(result);
      expect(empty).toMatchObject({ state_abbr: state, total: 0, offset: 0, agencies: [] });
      expect(empty).not.toHaveProperty('next_offset');
      expect(empty.notice).toContain(`no agency directory for ${state}`);
      expect(text(result)).toContain(empty.notice ?? '');
    }
  });

  it('reports filters that match nothing with a notice naming them', async () => {
    serveDirectory('TX', txDirectory);
    const result = await search({
      state_abbr: 'TX',
      name_contains: 'zzzz',
      county: 'bexar',
      agency_type: 'Tribal',
    });
    const empty = page(result);
    expect(empty).toMatchObject({ total: 0, agencies: [] });
    expect(empty.notice).toContain('name_contains "zzzz"');
    expect(empty.notice).toContain('county "bexar"');
    expect(empty.notice).toContain('agency_type "Tribal"');
    expect(empty.notice).toContain('1763');
    expect(text(result)).toContain(empty.notice ?? '');
  });
});

describe('name_contains tokenization timing', () => {
  it('stays linear in thread CPU from 5k to 320k characters', async () => {
    serveDirectory('DC', dcDirectory);
    const shapes = [
      (n: number) => `${'§1 x'.repeat(n)}\ny`,
      (n: number) => `${'  \r\n'.repeat(n)}y`,
    ];
    for (const shape of shapes) {
      const cpuMicros: number[] = [];
      for (let size = 5000; size <= 320000; size *= 2) {
        const nameContains = shape(size / 4);
        const before = process.threadCpuUsage();
        const result = await search({ state_abbr: 'DC', name_contains: nameContains });
        const used = process.threadCpuUsage(before);
        expect(result.isError).not.toBe(true);
        const micros = used.user + used.system;
        expect(micros, `${size} characters`).toBeLessThan(2_000_000);
        cpuMicros.push(micros);
      }
      const first = Math.max(cpuMicros[0] ?? 1, 1);
      expect((cpuMicros.at(-1) ?? 0) / first).toBeLessThan(256);
    }
  });
});

describe('directory ORIs chain into the agency-scope tools', () => {
  it('names every agency-scope tool in its description and ori field, and each accepts every TX directory ORI', () => {
    const scoped = [
      [fbiGetCrimeEstimates, { offense: 'violent-crime' }],
      [fbiGetHateCrimes, {}],
      [fbiGetArrests, {}],
      [fbiGetNibrsBreakdown, { offense: '13A' }],
    ] as const;
    const agencyShape = fbiSearchAgencies.output.shape.agencies.element.shape;
    const records = Object.values(txDirectory as Record<string, { ori: string }[]>).flat();
    expect(records).toHaveLength(1763);
    for (const [tool, selector] of scoped) {
      expect(fbiSearchAgencies.description).toContain(tool.name);
      expect(agencyShape.ori.description).toContain(tool.name);
      for (const { ori } of records) {
        expect(() =>
          tool.input.parse({
            scope: 'agency',
            ori,
            ...selector,
            from_year: 2023,
            to_year: 2023,
          }),
        ).not.toThrow();
      }
    }
  });

  it('feeds a searched ORI into agency estimates', async () => {
    serveDirectory('TX', txDirectory);
    const found = page(await search({ state_abbr: 'TX', name_contains: 'san antonio police' }));
    const ori = found.agencies[0]?.ori ?? '';
    serveSummarized(ori, 'agency-violent-2023-txspd0000');
    const result = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'agency',
      ori,
      offense: 'violent-crime',
      from_year: 2023,
      to_year: 2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ori: 'TXSPD0000',
      entity_name: 'San Antonio Police Department',
      total_months: 12,
    });
    const { months } = result.structuredContent as { months: unknown[] };
    expect(months[0]).toMatchObject({ year: 2023, month: 1, actual_count: 1027 });
  });

  it('returns null-count months for a directory ORI that reported nothing', async () => {
    serveSummarized('AZ0141000', 'agency-violent-2023-az0141000');
    const result = await runToolContract(fbiGetCrimeEstimates, {
      scope: 'agency',
      ori: 'AZ0141000',
      offense: 'violent-crime',
      from_year: 2023,
      to_year: 2023,
    });
    expect(result.isError).not.toBe(true);
    const { months } = result.structuredContent as { months: { actual_count: number | null }[] };
    expect(months).toHaveLength(12);
    for (const month of months) expect(month.actual_count).toBeNull();
  });
});
