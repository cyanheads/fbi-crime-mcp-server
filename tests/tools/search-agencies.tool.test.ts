/**
 * @fileoverview Tests for fbi_search_agencies over the captured CDE agency directory,
 * driven through the real service and the tool contract.
 * @module tests/tools/search-agencies.tool.test
 */

import { readFileSync } from 'node:fs';
import { z } from '@cyanheads/mcp-ts-core';
import { parseConfig } from '@cyanheads/mcp-ts-core/config';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  createFetchMock,
  createInMemoryStorage,
  createMockContext,
  runToolContract,
} from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';
import {
  fbiSearchAgencies,
  setLimitClamping,
} from '@/mcp-server/tools/definitions/search-agencies.tool.js';
import { getFbiApiService, initFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

/** Records the limit-clamp counter's increments; every other utils export is the framework's own. */
const clampCounter = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@cyanheads/mcp-ts-core/utils', async (importOriginal) => {
  const utils = await importOriginal<typeof import('@cyanheads/mcp-ts-core/utils')>();
  return {
    ...utils,
    createCounter: (...args: Parameters<typeof utils.createCounter>) =>
      args[0] === 'fbi.limit.clamped' ? clampCounter : utils.createCounter(...args),
  };
});

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

type DirectoryRow = readonly [ori: string, agency_name: string, type: string, counties: string];

/** A directory in CDE's shape — agencies grouped under their county string — from directory rows. */
function directoryOf(state_abbr: string, rows: readonly DirectoryRow[]): Record<string, unknown[]> {
  const directory: Record<string, unknown[]> = {};
  for (const [ori, agency_name, agency_type_name, counties] of rows) {
    directory[counties] ??= [];
    directory[counties].push({
      ori,
      counties,
      is_nibrs: true,
      state_abbr,
      agency_name,
      agency_type_name,
      nibrs_start_date: null,
    });
  }
  return directory;
}

/** Captured directory rows (2026-11-16) for the county spellings CDE stores without a suffix. */
const laDirectory = directoryOf('LA', [
  ['LA0010000', "Acadia Parish Sheriff's Office", 'County', 'ACADIA'],
  ['LA0010100', 'Crowley Police Department', 'City', 'ACADIA'],
  ['LA0010200', 'Rayne Police Department', 'City', 'ACADIA'],
  ['LA0010300', 'Church Point Police Department', 'City', 'ACADIA'],
  ['LALSP0000', 'State Police', 'State Police', 'UNMAPPED COUNTY'],
]);
const akDirectory = directoryOf('AK', [
  ['AK0010100', 'Anchorage Police Department', 'City', 'ANCHORAGE'],
  ['AK0011300', 'Bethel Police Department', 'City', 'BETHEL'],
  ['AK0010300', 'Juneau Police Department', 'City', 'JUNEAU'],
  ['AK0012000', 'Soldotna Police Department', 'City', 'KENAI PENINSULA'],
  ['AK0010800', 'Seward Police Department', 'City', 'KENAI PENINSULA'],
  ['AK0012300', 'Kenai Police Department', 'City', 'KENAI PENINSULA'],
  ['AK0012200', 'Homer Police Department', 'City', 'KENAI PENINSULA'],
  ['AK0015600', 'Wasilla Police Department', 'City', 'MATANUSKA-SUSITNA'],
  ['AK0011700', 'Palmer Police Department', 'City', 'MATANUSKA-SUSITNA'],
]);
const vaDirectory = directoryOf('VA', [
  ['VA0290100', 'Fairfax County Police Department', 'County', 'FAIRFAX'],
  ['VA029SP00', 'State Police: Fairfax County', 'State Police', 'FAIRFAX'],
  ['VA0290300', 'Vienna Police Department', 'City', 'FAIRFAX'],
  ['VA0290200', 'Herndon Police Department', 'City', 'FAIRFAX'],
  ['VA0290500', 'Northern Virginia Community College', 'University or College', 'FAIRFAX'],
  ['VA0290400', 'George Mason University', 'University or College', 'FAIRFAX'],
  ['VA1075000', 'Fairfax City Police Department', 'City', 'FAIRFAX CITY'],
]);
const njDirectory = directoryOf('NJ', [
  ['NJ0201700', 'Springfield Township Police Department, Union County', 'City', 'UNION'],
  ['NJ0200800', 'Kenilworth Police Department', 'City', 'UNION'],
  ['NJ0091000', 'Union City Police Department', 'City', 'HUDSON'],
]);
const moDirectory = directoryOf('MO', [
  ['MO0955300', 'Northwoods Police Department', 'City', 'ST LOUIS'],
  ['MO0950000', 'St. Louis County Police Department', 'County', 'ST LOUIS'],
  ['MO095019E', 'Washington University', 'University or College', 'ST LOUIS'],
  ['MO0360400', 'Pacific Police Department', 'City', 'FRANKLIN, ST LOUIS'],
  ['MOSPD0000', 'St. Louis Police Department', 'City', 'ST LOUIS CITY'],
]);
const inDirectory = directoryOf('IN', [
  ['IN0461100', 'Kingsbury Police Department', 'City', 'LA PORTE'],
  ['IN0460000', "La Porte County Sheriff's Office", 'County', 'LA PORTE'],
  [
    'IN046139E',
    'Northern Indiana Commuter Transportation District',
    'Other State Agency',
    'LA PORTE',
  ],
]);
const nmDirectory = directoryOf('NM', [
  ['NM0070100', 'Las Cruces Police Department', 'City', 'DONA ANA'],
  ['NM0070000', "Dona Ana County Sheriff's Office", 'County', 'DONA ANA'],
  ['NM0070400', 'New Mexico State University', 'University or College', 'DONA ANA'],
]);
const hiDirectory = directoryOf('HI', [
  ['HI0040000', 'Kauai Police Department', 'County', 'KAUAI'],
  ['HI0040300', 'Department of Law Enforcement: Kauai', 'Other State Agency', 'KAUAI'],
  ['HI0010000', 'Hawaii Police Department', 'County', 'HAWAII'],
]);
const mdDirectory = directoryOf('MD', [
  ['MD0172100', "Prince George's County Police Department", 'County', "PRINCE GEORGE'S"],
  ['MD0172200', 'Riverdale Park Police Department', 'City', "PRINCE GEORGE'S"],
]);

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
  clampCounter.add.mockClear();
  initFbiApiService(parseConfig(), createInMemoryStorage(), {
    apiKey: 'TEST_KEY',
    baseUrlCde: baseUrl,
    requestTimeoutMs: 15000,
  });
});
afterEach(() => {
  http.restore();
  setLimitClamping(true);
  vi.unstubAllEnvs();
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
      { state_abbr: 'TX', limit: -1 },
      { state_abbr: 'TX', limit: 1.5 },
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

describe('fbi_search_agencies county names', () => {
  /** ORIs a county search returns, each also found in the rendered table. */
  async function countyOris(
    state_abbr: string,
    county: string,
    filters: Record<string, unknown> = {},
  ): Promise<string[]> {
    const result = await search({ state_abbr, county, limit: 200, ...filters });
    const body = page(result);
    expect(body.total, `${state_abbr} ${county}`).toBe(body.agencies.length);
    for (const agency of body.agencies) expect(text(result)).toContain(`| ${agency.ori} |`);
    return body.agencies.map((a) => a.ori);
  }

  /**
   * 0.4.1 matched a county name by lowercase equality; the county filter now compares keys that
   * also drop spaces, punctuation, and accents. Every TX name is uppercase words, so its key departs
   * from 0.4.1's comparison only by dropping spaces. The checked set keeps every name where that
   * could change a result (a name with a space, a name whose letters contain or sit inside
   * another's) and every county of an agency listing several, which must match each of them. The
   * rest are single words that compare exactly as 0.4.1 compared them, so every tenth stands in for
   * them. The full replay of all 54 CDE directories ran outside the suite.
   */
  it('matches TX county names to exactly the agencies that list them', async () => {
    serveDirectory('TX', txDirectory);
    // The directory-fetch tests cover the parse; parse it once here and serve it to every call.
    const service = getFbiApiService();
    const parsed = await service.getAgencyDirectory('TX', createMockContext());
    vi.spyOn(service, 'getAgencyDirectory').mockResolvedValue(parsed);
    const records = Object.values(
      txDirectory as Record<string, { ori: string; counties: string }[]>,
    ).flat();
    const countiesOf = (record: { counties: string }) =>
      record.counties.split(',').map((county) => county.trim());
    const all = [...new Set(records.flatMap(countiesOf))].sort();
    expect(all.length).toBeGreaterThan(250);
    expect(all.filter((name) => !/^[A-Z]+( [A-Z]+)*$/.test(name))).toEqual([]);
    const letters = (name: string) => name.replaceAll(' ', '');
    const nested = (name: string) =>
      all.some(
        (other) =>
          other !== name &&
          (letters(other).includes(letters(name)) || letters(name).includes(letters(other))),
      );
    const shared = new Set(
      records
        .map(countiesOf)
        .filter((list) => list.length > 1)
        .flat(),
    );
    const kept = all.filter((name) => name.includes(' ') || nested(name) || shared.has(name));
    const rest = all.filter((name) => !kept.includes(name));
    const names = [...kept, ...rest.filter((_, i) => i % 10 === 0)];
    for (const name of names) {
      const listing = records.filter((r) => countiesOf(r).includes(name)).map((r) => r.ori);
      const found = page(
        await search({ state_abbr: 'TX', county: name.toLowerCase(), limit: 200 }),
      );
      expect(found.agencies.map((a) => a.ori).sort(), name).toEqual(listing.sort());
    }
  });

  it('retries a name given with a county-type suffix without it', async () => {
    serveDirectory('TX', txDirectory);
    serveDirectory('LA', laDirectory);
    serveDirectory('AK', akDirectory);
    for (const [state, given, bare] of [
      ['TX', 'Bexar County', 'Bexar'],
      ['TX', 'BEXAR COUNTY', 'bexar'],
      ['LA', 'Acadia Parish', 'Acadia'],
      ['AK', 'Kenai Peninsula Borough', 'Kenai Peninsula'],
      ['AK', 'Juneau City and Borough', 'Juneau'],
      ['AK', 'Bethel Census Area', 'Bethel'],
      ['AK', 'Anchorage Municipality', 'Anchorage'],
      ['AK', 'Matanuska-Susitna Borough', 'Matanuska-Susitna'],
    ] as const) {
      const bareOris = await countyOris(state, bare);
      expect(bareOris.length, bare).toBeGreaterThan(0);
      expect(await countyOris(state, given), given).toEqual(bareOris);
    }
    const bexar = page(await search({ state_abbr: 'TX', county: 'Bexar County', limit: 200 }));
    expect(bexar.total).toBe(42);
    expect(bexar.agencies.find((a) => a.ori === 'TXSPD0000')?.counties).toEqual([
      'BEXAR',
      'MEDINA',
    ]);
  });

  it('keeps the names CDE stores with a suffix, and never strips City', async () => {
    serveDirectory('LA', laDirectory);
    serveDirectory('VA', vaDirectory);
    expect(await countyOris('LA', 'Unmapped County')).toEqual(['LALSP0000']);
    expect(await countyOris('VA', 'Fairfax City')).toEqual(['VA1075000']);
    const fairfax = await countyOris('VA', 'Fairfax');
    expect([...fairfax].sort()).toEqual([
      'VA0290100',
      'VA0290200',
      'VA0290300',
      'VA0290400',
      'VA0290500',
      'VA029SP00',
    ]);
    expect(await countyOris('VA', 'Fairfax County')).toEqual(fairfax);
  });

  it('compares letters and digits only, ignoring case, accents, spaces, periods, apostrophes, and hyphens', async () => {
    serveDirectory('MO', moDirectory);
    serveDirectory('IN', inDirectory);
    serveDirectory('NM', nmDirectory);
    const stLouis = await countyOris('MO', 'ST LOUIS');
    expect([...stLouis].sort()).toEqual(['MO0360400', 'MO0950000', 'MO095019E', 'MO0955300']);
    expect(await countyOris('MO', 'St. Louis County')).toEqual(stLouis);
    expect(await countyOris('MO', 'st louis')).toEqual(stLouis);
    expect(await countyOris('MO', 'St. Louis City')).toEqual(['MOSPD0000']);
    const laPorte = await countyOris('IN', 'La Porte');
    expect(laPorte).toHaveLength(3);
    expect(await countyOris('IN', 'LaPorte County')).toEqual(laPorte);
    const donaAna = await countyOris('NM', 'Dona Ana');
    expect(donaAna).toHaveLength(3);
    expect(await countyOris('NM', 'Doña Ana County')).toEqual(donaAna);
  });

  it('ignores apostrophes written as modifier letters: the ʻokina (U+02BB) and U+02BC', async () => {
    serveDirectory('HI', hiDirectory);
    serveDirectory('MD', mdDirectory);
    const kauai = await countyOris('HI', 'Kauai');
    expect([...kauai].sort()).toEqual(['HI0040000', 'HI0040300']);
    expect(await countyOris('HI', 'Kauaʻi County')).toEqual(kauai);
    expect(await countyOris('HI', 'Hawaiʻi')).toEqual(['HI0010000']);
    const princeGeorges = await countyOris('MD', "Prince George's");
    expect(princeGeorges).toHaveLength(2);
    expect(await countyOris('MD', 'Prince Georgeʼs County')).toEqual(princeGeorges);
  });

  it('matches nothing for Union City or a bare suffix, with a notice on how CDE names counties', async () => {
    serveDirectory('NJ', njDirectory);
    for (const county of ['Union City', 'County', 'Parish']) {
      const result = await search({ state_abbr: 'NJ', county });
      const empty = page(result);
      expect(empty, county).toMatchObject({ total: 0, agencies: [] });
      expect(empty.notice).toContain(`county "${county}"`);
      expect(empty.notice).toContain('without a County, Parish, or Borough suffix');
      expect(empty.notice).toContain('FAIRFAX CITY');
      expect(text(result)).toContain(empty.notice ?? '');
    }
  });

  it('retries without the suffix only when the name equals no county in the state directory', async () => {
    // A directory listing both X COUNTY and X: the retry follows the county list, not the filtered page.
    serveDirectory(
      'DC',
      directoryOf('DC', [
        ['DC0000001', 'Harris County Agency', 'City', 'HARRIS COUNTY'],
        ['DC0000002', 'Harris Tribal Police', 'Tribal', 'HARRIS'],
      ]),
    );
    expect(await countyOris('DC', 'Harris County')).toEqual(['DC0000001']);
    expect(await countyOris('DC', 'Harris')).toEqual(['DC0000002']);
    expect(await countyOris('DC', 'Harris County', { agency_type: 'Tribal' })).toEqual([]);
  });

  it('strips a county-type suffix only as a whole word, and keeps digits in the key', async () => {
    serveDirectory(
      'DC',
      directoryOf('DC', [
        ['DC0000011', 'Hills Police Department', 'City', 'HILLS'],
        ['DC0000021', 'First District Police', 'City', 'DISTRICT 1'],
        ['DC0000022', 'Second District Police', 'City', 'DISTRICT 2'],
      ]),
    );
    expect(await countyOris('DC', 'Hillsborough')).toEqual([]);
    expect(await countyOris('DC', 'Hills Borough')).toEqual(['DC0000011']);
    expect(await countyOris('DC', 'District 1')).toEqual(['DC0000021']);
    expect(await countyOris('DC', 'district-2 county')).toEqual(['DC0000022']);
    expect(await countyOris('DC', 'District 3')).toEqual([]);
    expect(await countyOris('DC', 'District')).toEqual([]);
  });

  it('explains how CDE names counties in the county description', () => {
    const description = fbiSearchAgencies.input.shape.county.description ?? '';
    expect(description).toContain('without a County, Parish, or Borough suffix');
    expect(description).toContain('FAIRFAX CITY');
  });
});

describe('fbi_search_agencies limit clamp', () => {
  type JsonSchemaObject = { properties: Record<string, Record<string, unknown>> };
  const advertisedLimit = () =>
    (z.toJSONSchema(fbiSearchAgencies.input, { io: 'input' }) as JsonSchemaObject).properties.limit;

  it('advertises an integer limit with a minimum, a default, and no maximum', () => {
    const limit = advertisedLimit();
    expect(limit).toMatchObject({ type: 'integer', minimum: 1, default: 50 });
    expect(limit).not.toHaveProperty('maximum');
    expect(limit?.description).toContain('at most 200');
  });

  it('serves a limit above 200 as the first 200 agencies, with one notice naming both values', async () => {
    serveDirectory('TX', txDirectory);
    const capped = page(await search({ state_abbr: 'TX', limit: 200 }));
    for (const [limit, named] of [
      [201, '201'],
      [5000, '5000'],
      [1e20, '100000000000000000000'],
    ] as const) {
      const result = await search({ state_abbr: 'TX', limit });
      const body = page(result);
      expect(body.agencies).toEqual(capped.agencies);
      expect(body).toMatchObject({
        total: 1763,
        next_offset: 200,
        truncated: true,
        shown: 200,
        cap: 200,
      });
      expect(body.notice).toBe(
        `Requested limit ${named} exceeds the 200-agency page maximum; applied limit 200. Showing 1–200 of 1763 matching agencies. Call again with offset: 200 for the next page, or narrow with name_contains, county, or agency_type.`,
      );
      expect(text(result)).toContain(body.notice ?? '');
    }
  });

  it('clamps without truncation when every match fits on one page', async () => {
    serveDirectory('TX', txDirectory);
    const result = await search({ state_abbr: 'TX', county: 'bexar', limit: 500 });
    const body = page(result);
    expect(body.total).toBe(42);
    expect(body.agencies).toHaveLength(42);
    expect(body).not.toHaveProperty('next_offset');
    expect(body).not.toHaveProperty('truncated');
    expect(body).not.toHaveProperty('shown');
    expect(body).not.toHaveProperty('cap');
    expect(body.notice).toBe(
      'Requested limit 500 exceeds the 200-agency page maximum; applied limit 200.',
    );
    expect(text(result)).toContain(body.notice ?? '');
  });

  it('serves limits up to 200 as asked, with no clamp notice', async () => {
    serveDirectory('TX', txDirectory);
    const full = page(await search({ state_abbr: 'TX', limit: 200 }));
    expect(full.notice).toBe(
      'Showing 1–200 of 1763 matching agencies. Call again with offset: 200 for the next page, or narrow with name_contains, county, or agency_type.',
    );
    const one = page(
      await search({ state_abbr: 'TX', name_contains: 'san antonio police', limit: 1 }),
    );
    expect(one.agencies).toHaveLength(1);
    expect(one).not.toHaveProperty('notice');
  });

  it('logs and counts each clamp once, and an unclamped call does neither', async () => {
    serveDirectory('TX', txDirectory);
    const clampLines = async (limit: number) => {
      const ctx = createMockContext();
      const info = vi.spyOn(ctx.log, 'info');
      await fbiSearchAgencies.handler(
        fbiSearchAgencies.input.parse({ state_abbr: 'TX', limit }),
        ctx,
      );
      return info.mock.calls.filter(([message]) => message === 'fbi_search_agencies limit clamped');
    };
    expect(await clampLines(201)).toEqual([
      ['fbi_search_agencies limit clamped', { requested: 201, applied: 200 }],
    ]);
    expect(clampCounter.add).toHaveBeenCalledExactlyOnceWith(1, {
      'mcp.tool.name': 'fbi_search_agencies',
    });
    clampCounter.add.mockClear();
    expect(await clampLines(200)).toEqual([]);
    expect(await clampLines(50)).toEqual([]);
    expect(clampCounter.add).not.toHaveBeenCalled();
  });

  it('with clamping off, advertises maximum 200 and rejects a larger limit before any fetch', async () => {
    setLimitClamping(false);
    expect(advertisedLimit()).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Agencies per page (1–200). Defaults to 50.',
    });
    catchAllRequests();
    for (const limit of [201, 1e20]) {
      const result = await search({ state_abbr: 'TX', limit });
      expect(result.isError, String(limit)).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.InvalidParams, data: { reason: 'invalid_arguments' } },
      });
    }
    expect(http.calls).toHaveLength(0);
  });

  it('takes the clamp mode from setup, never from the environment', () => {
    vi.stubEnv('FBI_CLAMP_LIMITS', 'false');
    expect(advertisedLimit()).not.toHaveProperty('maximum');
    expect(fbiSearchAgencies.input.safeParse({ state_abbr: 'TX', limit: 201 }).success).toBe(true);
    setLimitClamping(false);
    expect(advertisedLimit()).toMatchObject({ maximum: 200 });
    expect(fbiSearchAgencies.input.safeParse({ state_abbr: 'TX', limit: 201 }).success).toBe(false);
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

/** Least thread CPU, in microseconds, over three single DC searches with `field` set to `value`. */
async function leastCpuMicros(field: 'county' | 'name_contains', value: string): Promise<number> {
  let least = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 3; run++) {
    const before = process.threadCpuUsage();
    const result = await search({ state_abbr: 'DC', [field]: value });
    const used = process.threadCpuUsage(before);
    expect(result.isError).not.toBe(true);
    least = Math.min(least, used.user + used.system);
  }
  return least;
}

/**
 * Doubles each shape from 5k to 320k characters, checking each size before the next so a
 * quadratic fails fast. The 5k baseline is re-timed beside each size; growth is measured
 * against the slowest baseline, so one baseline on a faster core cannot fail linear work.
 */
async function expectLinearCpu(
  field: 'county' | 'name_contains',
  shapes: [string, (size: number) => string][],
): Promise<void> {
  serveDirectory('DC', dcDirectory);
  for (const [label, shape] of shapes) {
    const baselines: number[] = [];
    for (let size = 5000; size <= 320_000; size *= 2) {
      baselines.push(await leastCpuMicros(field, shape(5000)));
      const micros = await leastCpuMicros(field, shape(size));
      expect(micros, `${label}, ${size} characters`).toBeLessThan(2_000_000);
      expect(micros / Math.max(...baselines, 1), `${label}, growth to ${size}`).toBeLessThan(256);
    }
  }
}

describe('name_contains tokenization timing', () => {
  it('stays linear in thread CPU from 5k to 320k characters', async () => {
    await expectLinearCpu('name_contains', [
      ['one long line ending in a break', (size) => `${'§1 x'.repeat(size / 4)}\ny`],
      ['line breaks throughout', (size) => `${'  \r\n'.repeat(size / 4)}y`],
    ]);
  });
});

describe('county name matching timing', () => {
  it('stays linear in thread CPU from 5k to 320k characters', async () => {
    await expectLinearCpu('county', [
      ['one long line ending in a break', (size) => `${'§1 x'.repeat(size / 4)}\ny`],
      ['line breaks throughout', (size) => `y${'  \r\n'.repeat(size / 4)}y`],
      ['repeated suffix words', (size) => `${'city and '.repeat(Math.ceil(size / 9))}borough`],
      ['one long digit run', (size) => '1'.repeat(size)],
    ]);
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
