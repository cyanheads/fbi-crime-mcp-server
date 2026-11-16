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
import { zeroCountsNotice } from '@/mcp-server/tools/cde-totals.js';
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

/** Answer one CDE path for one view (`totals` or `counts`) with an HTTP failure status. */
function failView(path: string, view: 'totals' | 'counts', status: number): void {
  http.route({
    match: (request) => {
      const url = new URL(request.url);
      return (
        url.origin === origin && url.pathname === path && url.searchParams.get('type') === view
      );
    },
    respond: new Response('upstream text', { status }),
  });
}

/** How many requests were made for one view. */
function viewCalls(view: 'totals' | 'counts'): number {
  return http.calls.filter((call) => new URL(call.request.url).searchParams.get('type') === view)
    .length;
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

/** The `Codes:` listing in a selector description, as `[code, label]` pairs in listed order. */
function listedLabels(description: string | undefined): [string, string][] {
  const listing = description?.split('Codes: ')[1]?.replace(/\.$/, '');
  if (!listing) throw new Error('description has no Codes: listing');
  return listing.split('; ').map((entry) => {
    const space = entry.indexOf(' ');
    return [entry.slice(0, space), entry.slice(space + 1)];
  });
}

/** The `Codes:` listing in a selector description, as its codes in listed order. */
function listedCodes(description: string | undefined): string[] {
  return listedLabels(description).map(([code]) => code);
}

/** CDE `Offense Category` rows that span more than one arrest code, with their codes. */
const MULTI_CODE_CATEGORIES = {
  'Homicide Offenses': ['11', '12'],
  'Human Trafficking': ['101', '102'],
  'Prostitution Offenses': ['140', '141', '142', '143'],
  'Drug/Narcotic Offenses': [
    '150',
    '151',
    '152',
    '153',
    '154',
    '155',
    '156',
    '157',
    '158',
    '159',
    '160',
  ],
  'Gambling Offenses': ['170', '171', '172', '173'],
  'Vagrancy/Loitering': ['300', '330'],
} as const;

/** Every arrest code's label, in enum order: what each code counts. */
const EXPECTED_LABELS: [string, string][] = [
  ['11', 'Murder and Nonnegligent Homicide'],
  ['12', 'Manslaughter by Negligence'],
  ['20', 'Rape - Not Specified (Legacy)'],
  ['30', 'Robbery'],
  ['50', 'Aggravated Assault'],
  ['55', 'Simple Assault'],
  ['60', 'Burglary'],
  ['70', 'Larceny - Theft'],
  ['90', 'Motor Vehicle Theft'],
  ['101', 'Commercial Sex Acts'],
  ['102', 'Involuntary Servitude'],
  ['110', 'Arson'],
  ['140', 'Prostitution and Commercialized Vice (Unspecified)'],
  ['141', 'Prostitution and Commercialized Vice - Prostitution'],
  ['142', 'Prostitution and Commercialized Vice - Assisting or Promoting Prostitution'],
  ['143', 'Prostitution and Commercialized Vice - Purchasing Prostitution'],
  ['150', 'Drug Abuse Violations (Unspecified)'],
  ['151', 'Drug Sale/Manufacturing (Unspecified)'],
  ['152', 'Drug Sale/Manufacturing - Opium or Cocaine or Their Derivatives'],
  ['153', 'Drug Sale/Manufacturing - Marijuana'],
  ['154', 'Drug Sale/Manufacturing - Synthetic Narcotics'],
  ['155', 'Drug Sale/Manufacturing - Other - Dangerous Nonnarcotic Drugs'],
  ['156', 'Drug Possession (Unspecified)'],
  ['157', 'Drug Possession - Opium or Cocaine or Their Derivatives'],
  ['158', 'Drug Possession - Marijuana'],
  ['159', 'Drug Possession - Synthetic Narcotics'],
  ['160', 'Drug Possession - Other - Dangerous Nonnarcotic Drugs'],
  ['170', 'Gambling (Unspecified)'],
  ['171', 'Gambling - Bookmaking (Horse and Sport Book)'],
  ['172', 'Gambling - Numbers and Lottery'],
  ['173', 'Gambling - All Other Gambling'],
  ['180', 'Forgery and Counterfeiting'],
  ['190', 'Fraud'],
  ['200', 'Embezzlement'],
  ['210', 'Stolen Property: Buying, Receiving, Possessing'],
  ['220', 'Vandalism'],
  ['230', 'Weapons: Carrying, Possessing, Etc.'],
  ['240', 'Sex Offenses (Except Rape, and Prostitution and Commercialized Vice)'],
  ['250', 'Offenses Against the Family and Children'],
  ['260', 'Driving Under the Influence'],
  ['270', 'Liquor Law Violations'],
  ['280', 'Drunkenness'],
  ['290', 'Disorderly Conduct'],
  ['300', 'Vagrancy'],
  ['310', 'All Other Offenses (Except Traffic)'],
  ['320', 'Suspicion'],
  ['330', 'Curfew and Loitering Law Violations'],
];

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

  it('labels a code that is one row of a multi-code category with that row, not the category', async () => {
    const payload = capture('arrest-national-drug150-2023');
    reply('/arrest/national/150', payload);
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '150',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      offense: '150',
      offense_label: 'Drug Abuse Violations (Unspecified)',
      offense_breakdown: { 'Drug Abuse Violations (Unspecified)': 55323 },
      offense_category: { 'Drug/Narcotic Offenses': 55323 },
    });
    expect(text(result)).toContain('**Offense:** 150 (Drug Abuse Violations \\(Unspecified\\))');
  });

  it('labels a code that is its whole category with the category name', async () => {
    reply('/arrest/national/50', capture('arrest-national-assault50-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '50',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      offense_label: 'Aggravated Assault',
      offense_category: { 'Aggravated Assault': 330205 },
    });
    expect(text(result)).toContain('**Offense:** 50 (Aggravated Assault)');
  });

  it('accepts Suspicion (320), which CDE serves as its own category', async () => {
    const payload = capture('arrest-national-suspicion320-2023');
    reply('/arrest/national/320', payload);
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '320',
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(requestUrl().pathname).toBe('/arrest/national/320');
    expect(result.structuredContent).toMatchObject({
      offense: '320',
      offense_label: 'Suspicion',
      offense_breakdown: { Suspicion: 905 },
      offense_category: { Suspicion: 905 },
    });
    expect(Object.keys(capture('arrest-national-2023')['Offense Breakdown'] ?? {})).toContain(
      'Suspicion',
    );
    expect(text(result)).toContain('**Offense:** 320 (Suspicion)');
  });

  it("labels every code of a multi-code category with its CDE Offense Breakdown row's name", () => {
    const breakdownRows = Object.keys(capture('arrest-national-2023')['Offense Breakdown'] ?? {});
    const categoryRows = Object.keys(capture('arrest-national-2023')['Offense Category'] ?? {});
    const labels = new Map(listedLabels(fbiGetArrests.input.shape.offense.description));
    for (const [category, codes] of Object.entries(MULTI_CODE_CATEGORIES)) {
      expect(categoryRows).toContain(category);
      for (const code of codes) expect(breakdownRows, code).toContain(labels.get(code));
    }
    expect(categoryRows).toContain(labels.get('50'));
  });

  it('lists every code with the label naming what it counts', () => {
    expect(listedLabels(fbiGetArrests.input.shape.offense.description)).toEqual(EXPECTED_LABELS);
  });

  it('says a code counts only its own row and names the codes of each multi-code category', () => {
    const description = fbiGetArrests.input.shape.offense.description ?? '';
    expect(description).toContain('counts only its own CDE Offense Breakdown row');
    expect(description).toContain('use all and read offense_category');
    expect(description).toContain('sum its codes');
    expect(description).toContain('Homicide Offenses 11, 12');
    expect(description).toContain('Human Trafficking 101, 102');
    expect(description).toContain('Prostitution Offenses 140–143');
    expect(description).toContain('Drug/Narcotic Offenses 150–160');
    expect(description).toContain('Gambling Offenses 170–173');
    expect(description).toContain('Vagrancy/Loitering 300, 330');
    expect(description).toContain('Every other code is its own category');
    expect(description.split('Codes: ')).toHaveLength(2);
  });

  it('advertises all plus the CDE codes, each mapped to its label in the description', () => {
    const offense = fbiGetArrests.input.shape.offense;
    const values = offense.unwrap().options;
    expect(values).toHaveLength(48);
    expect(values).toContain('all');
    expect(values).toContain('30');
    expect(values).toContain('310');
    expect(values).toContain('320');
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

describe('fbi_get_arrests include_monthly', () => {
  type MonthlyRow = Record<string, number | null>;
  const monthlyOf = (result: Result) =>
    (result.structuredContent as { monthly?: MonthlyRow[] }).monthly;

  it('false sends only the totals request and returns no monthly', async () => {
    reply('/arrest/national/all', capture('arrest-national-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      include_monthly: false,
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(requests()).toEqual(['/arrest/national/all?totals&01-2023&12-2023']);
    expect(result.structuredContent).not.toHaveProperty('monthly');
    expect(text(result)).not.toContain('### Monthly counts');
  });

  it('true adds one counts request for the same path, selector, and window', async () => {
    replyView('/arrest/national/30', 'totals', capture('arrest-national-robbery30-2023'));
    replyView('/arrest/national/30', 'counts', capture('counts-arrest-national-robbery30-2023'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '30',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(requests()).toEqual([
      '/arrest/national/30?counts&01-2023&12-2023',
      '/arrest/national/30?totals&01-2023&12-2023',
    ]);
    const monthly = monthlyOf(result) ?? [];
    expect(monthly).toHaveLength(12);
    // The robbery code's own monthly arrests, not the all-offense series.
    expect(monthly[5]).toEqual({
      year: 2023,
      month: 6,
      arrest_count: 5662,
      rate_per_100k: 1.74,
      population: 338357687,
      participated_population: 324713502,
      population_coverage_percent: 95.97,
    });
    expect(result.structuredContent).toMatchObject({ offense_label: 'Robbery' });
    const body = text(result);
    expect(body.split('\n').filter((line) => line.startsWith('### '))).toEqual([
      ...GROUPS.map(([, , heading]) => `### ${heading}`),
      '### Monthly counts',
    ]);
    expect(tableRows(body, 'Monthly counts')).toHaveLength(12);
    expect(body).toContain('| 2023 | 06 | 5,662 | 1.74 | 338,357,687 | 324,713,502 | 95.97% |');
  });

  it('returns all 492 months of 1985–2025 in one call, sorted by year then month', async () => {
    // Totals are a fixed-size category payload whatever the window; the 2023 capture stands in.
    replyView('/arrest/national/all', 'totals', capture('arrest-national-2023'));
    replyView('/arrest/national/all', 'counts', capture('counts-arrest-national-all-1985-2025'));
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      include_monthly: true,
      from_year: 1985,
      to_year: 2025,
    });
    expect(result.isError).not.toBe(true);
    const monthly = monthlyOf(result) ?? [];
    expect(monthly).toHaveLength(492);
    expect(monthly.slice(0, 2).map(({ year, month }) => [year, month])).toEqual([
      [1985, 1],
      [1985, 2],
    ]);
    expect(monthly.at(-1)).toMatchObject({ year: 2025, month: 12 });
    expect(tableRows(text(result), 'Monthly counts')).toHaveLength(492);
  });

  it('an unrecognized ORI returns an empty monthly and a notice that says so', async () => {
    replyView('/arrest/agency/QQ0000000/all', 'totals', capture('arrest-agency-unknown-2023'));
    replyView(
      '/arrest/agency/QQ0000000/all',
      'counts',
      capture('counts-arrest-agency-unknown-all-2023'),
    );
    const result = await runToolContract(fbiGetArrests, {
      scope: 'agency',
      ori: 'QQ0000000',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    expect(monthlyOf(result)).toEqual([]);
    const notice = (result.structuredContent as { notice?: string }).notice ?? '';
    expect(notice).toMatch(/^Every count is zero because CDE does not recognize the ORI/);
    const body = text(result);
    expect(body).toContain(notice);
    expect(body).toMatch(/### Monthly counts\nCDE sent no monthly series for this state or ORI\./);
  });

  it('a recognized agency with no reports keeps its 12 null months and is not called unknown', async () => {
    replyView('/arrest/agency/TX0950000/all', 'totals', capture('arrest-agency-unknown-2023'));
    replyView(
      '/arrest/agency/TX0950000/all',
      'counts',
      capture('counts-arrest-agency-tx0950000-all-2023'),
    );
    const result = await runToolContract(fbiGetArrests, {
      scope: 'agency',
      ori: 'TX0950000',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).not.toBe(true);
    const monthly = monthlyOf(result) ?? [];
    expect(monthly).toHaveLength(12);
    expect(monthly.every((row) => row.arrest_count === null)).toBe(true);
    const notice = (result.structuredContent as { notice?: string }).notice ?? '';
    expect(notice).toMatch(
      /^Every count is zero, but these are not reported counts: CDE recognizes the ORI/,
    );
    expect(notice).toContain('the agency reported for no month of this window');
    expect(notice).not.toContain('does not recognize');
    expect(text(result)).toContain(notice);
    expect(text(result)).toContain('| 2023 | 01 | — | — | 7,149 | — | — |');
  });

  it('fails a malformed counts payload as malformed upstream data', async () => {
    replyView('/arrest/national/all', 'totals', capture('arrest-national-2023'));
    replyView('/arrest/national/all', 'counts', { rates: null, actuals: { 'US Arrests': 'many' } });
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      include_monthly: true,
      ...year2023,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.SerializationError },
    });
    expect(text(result)).toContain('Malformed FBI arrest counts response');
  });

  it('fails a counts payload without its actuals key as malformed upstream data', async () => {
    const counts: Record<string, unknown> = capture('counts-arrest-national-robbery30-2023');
    delete counts.actuals;
    replyView('/arrest/national/30', 'totals', capture('arrest-national-robbery30-2023'));
    replyView('/arrest/national/30', 'counts', counts);
    const result = await runToolContract(fbiGetArrests, {
      scope: 'national',
      offense: '30',
      include_monthly: true,
      ...year2023,
    });
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.SerializationError },
    });
    expect(text(result)).toContain('Malformed FBI arrest counts response');
  });

  const monthlyPath = '/arrest/national/all';
  const monthlyInput = { scope: 'national', include_monthly: true, ...year2023 } as const;

  for (const [failed, retried] of [
    ['totals', 'counts'],
    ['counts', 'totals'],
  ] as const) {
    it(`a ${failed} 404 stops the ${retried} leg mid-retry and surfaces the 404`, async () => {
      vi.useFakeTimers();
      failView(monthlyPath, failed, 404);
      failView(monthlyPath, retried, 500);
      const pending = runToolContract(fbiGetArrests, monthlyInput);
      // Well past every backoff of the 500 leg's four attempts.
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pending;
      expect(result.structuredContent).toMatchObject({
        error: { code: JsonRpcErrorCode.NotFound, data: { status: 404 } },
      });
      expect(text(result)).not.toMatch(/abort|cancel/i);
      expect(viewCalls(failed)).toBe(1);
      expect(viewCalls(retried)).toBe(1);
    });
  }

  for (const [status, code] of [
    [404, JsonRpcErrorCode.NotFound],
    [400, JsonRpcErrorCode.InvalidParams],
    [403, JsonRpcErrorCode.Forbidden],
  ] as const) {
    it(`a counts HTTP ${status} fails the call with one request per leg`, async () => {
      vi.useFakeTimers();
      replyView(monthlyPath, 'totals', capture('arrest-national-2023'));
      failView(monthlyPath, 'counts', status);
      const pending = runToolContract(fbiGetArrests, monthlyInput);
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pending;
      expect(result.structuredContent).toMatchObject({ error: { code, data: { status } } });
      if (status === 403) {
        const hint = "api.data.gov refused this server's API key (FBI_API_KEY)";
        expect(result.structuredContent).toMatchObject({
          error: { data: { recovery: { hint: expect.stringContaining(hint) } } },
        });
        expect(text(result)).toContain(hint);
      }
      expect(viewCalls('totals')).toBe(1);
      expect(viewCalls('counts')).toBe(1);
    });
  }

  it('a counts HTTP 500 is retried to exhaustion, then fails as ServiceUnavailable', async () => {
    vi.useFakeTimers();
    replyView(monthlyPath, 'totals', capture('arrest-national-2023'));
    failView(monthlyPath, 'counts', 500);
    const pending = runToolContract(fbiGetArrests, monthlyInput);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.ServiceUnavailable, data: { status: 500, retryAttempts: 4 } },
    });
    expect(viewCalls('totals')).toBe(1);
    expect(viewCalls('counts')).toBe(4);
  });

  it('caller cancellation aborts both requests and settles as RequestCancelled', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const bothSent = Promise.withResolvers<void>();
    http.route({
      match: (request) => new URL(request.url).origin === origin,
      respond: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
          if (signals.push(request.signal) === 2) bothSent.resolve();
        }),
    });
    const pending = runToolContract(fbiGetArrests, monthlyInput, {
      context: { signal: controller.signal },
    });
    await bothSent.promise;
    controller.abort(new DOMException('Caller cancelled', 'AbortError'));
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
    const result = await pending;
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.RequestCancelled },
    });
    expect(viewCalls('totals')).toBe(1);
    expect(viewCalls('counts')).toBe(1);
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
    // Without include_monthly the identifier is unchecked: the notice names both causes.
    expect(structured.notice).toBe(zeroCountsNotice('agency', 'unchecked'));
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
    expect(notice).toBe(zeroCountsNotice('state', 'unchecked'));
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
