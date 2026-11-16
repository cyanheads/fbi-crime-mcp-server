/**
 * @fileoverview FBI agency search over the CDE state agency directory.
 * Fetches one state's full directory, filters it locally by name words, county, and
 * agency type, sorts by name then ORI, and returns one page — the ORI discovery step
 * for agency scope in fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests,
 * fbi_get_nibrs_breakdown, and fbi_get_police_employees.
 * @module mcp-server/tools/definitions/search-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { ATTR_MCP_TOOL_NAME, createCounter } from '@cyanheads/mcp-ts-core/utils';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';
import type { FbiDirectoryAgency } from '@/services/fbi-api/types.js';

/** Agencies per page at most; a larger limit is served at this size while clamping is on. */
const LIMIT_CAP = 200;

/**
 * Whether a limit above LIMIT_CAP is clamped (true) or rejected. setup() sets it from
 * FBI_CLAMP_LIMITS; the limit schema reads it on every tools/list and every validation. Server
 * config is never read here: tool() emits the input JSON Schema at import, and under Node that
 * runs before the framework loads `.env`.
 */
let clampLimits = true;

/** Hands the parsed FBI_CLAMP_LIMITS from setup() to the limit schema. */
export function setLimitClamping(enabled: boolean): void {
  clampLimits = enabled;
}

const limitClamps = createCounter(
  'fbi.limit.clamped',
  'fbi_search_agencies calls whose limit was served at the page maximum',
  '{call}',
);

/** Every agency type the CDE directory uses across all 54 jurisdictions it serves. */
const AGENCY_TYPES = [
  'City',
  'County',
  'Other State Agency',
  'Other',
  'State Police',
  'University or College',
  'Tribal',
] as const;

/** A blank or whitespace-only optional string from a form client means the filter is unset. */
const blankOrSpaceAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );

type Agency = {
  ori: string;
  agency_name: string;
  agency_type: string;
  counties: string[];
  is_nibrs: boolean;
  nibrs_start_date?: string;
};

function toAgency(record: FbiDirectoryAgency): Agency {
  return {
    ori: record.ori,
    agency_name: record.agency_name,
    agency_type: record.agency_type_name,
    counties: record.counties.split(',').map((county) => county.trim()),
    is_nibrs: record.is_nibrs,
    ...(record.nibrs_start_date != null && { nibrs_start_date: record.nibrs_start_date }),
  };
}

/** Case-insensitive agency name, then ORI — a total order, so offsets are stable across calls. */
function byNameThenOri(a: Agency, b: Agency): number {
  const an = a.agency_name.toLowerCase();
  const bn = b.agency_name.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.ori < b.ori ? -1 : a.ori > b.ori ? 1 : 0;
}

/**
 * A county name as its lowercase letters and digits, accents dropped, so the spellings other
 * sources use meet CDE's: `St. Louis` and `ST LOUIS` both become `stlouis`. Modifier letters go
 * too, since the ʻokina (`Kauaʻi`) and U+02BC are apostrophes Unicode files as letters. No two
 * county names in one CDE state directory share a key.
 */
function countyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}]|\p{Lm}/gu, '');
}

/** County-type suffixes CDE never stores, as county-key words, longest first. City is not one. */
const COUNTY_SUFFIXES = [
  ['city', 'and', 'borough'],
  ['census', 'area'],
  ['municipality'],
  ['borough'],
  ['parish'],
  ['county'],
];

/**
 * The county filter's key: the name as given when it equals a county in the state's directory,
 * otherwise the name without one trailing county-type suffix (`Bexar County` → `bexar`). The
 * retry follows the whole directory, not the other filters, so a stored `X COUNTY` is never read
 * as `X`, and City stays, since CDE keeps it on independent cities (`FAIRFAX CITY`).
 */
function countyFilterKey(county: string, directory: readonly Agency[]): string {
  const words = county.split(/\s+/).map(countyKey).filter(Boolean);
  const asGiven = words.join('');
  if (directory.some((agency) => agency.counties.some((c) => countyKey(c) === asGiven)))
    return asGiven;
  const suffix = COUNTY_SUFFIXES.find(
    (suffixWords) =>
      words.length > suffixWords.length &&
      suffixWords.every((word, i) => words[words.length - suffixWords.length + i] === word),
  );
  return suffix ? words.slice(0, -suffix.length).join('') : asGiven;
}

/** CDE-authored text in a table cell: escape inline markdown and flatten line breaks. */
function cell(value: string): string {
  return value.replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/\r\n|\r|\n/g, ' ');
}

export const fbiSearchAgencies = tool('fbi_search_agencies', {
  title: 'FBI Search Agencies',
  description:
    "Find law enforcement agencies in one state and their nine-character ORI codes, the identifier agency scope needs in fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests, fbi_get_nibrs_breakdown, and fbi_get_police_employees. Fetches the state's full FBI CDE agency directory, filters it by words in the agency name, county, and agency type, sorts by agency name then ORI, and returns one page with the total match count and next_offset for the following page. Each agency carries its type, counties, and NIBRS reporting status. A code CDE has no directory for (AS, MP, or an unrecognized code) returns zero agencies with a notice.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  input: z.object({
    state_abbr: z
      .string()
      .length(2)
      .regex(/^[A-Za-z]{2}$/, 'Use two ASCII letters for state_abbr.')
      .describe('Two ASCII-letter state abbreviation (e.g. TX, DC, PR); case-insensitive.'),
    name_contains: blankOrSpaceAsUnset(z.string().optional()).describe(
      'Words or word fragments that must all appear in the agency name, in any order, case-insensitively (e.g. "san antonio police").',
    ),
    county: blankOrSpaceAsUnset(z.string().optional()).describe(
      "County name, e.g. Bexar or Bexar County. CDE lists county names without a County, Parish, or Borough suffix and keeps CITY on independent cities (FAIRFAX CITY beside FAIRFAX), so a name equal to none of the state's counties is retried without a trailing County, Parish, Borough, Census Area, Municipality, or City and Borough. Case, accents, spaces, periods, apostrophes, and hyphens are ignored (St. Louis matches ST LOUIS). Matches an agency when it equals any of the agency's counties, so an agency serving several counties matches each of them.",
    ),
    agency_type: blankOrSpaceAsUnset(z.enum(AGENCY_TYPES).optional()).describe(
      'Agency type: City, County, Other State Agency, Other, State Police, University or College, or Tribal.',
    ),
    // Not .int(): Zod advertises and enforces Number.MAX_SAFE_INTEGER for it, which would reject
    // 1e20 rather than clamp it. The getters follow setLimitClamping() on every tools/list.
    limit: z
      .number()
      .min(1)
      .check((payload) => {
        if (!Number.isInteger(payload.value)) {
          payload.issues.push({
            code: 'invalid_type',
            expected: 'int',
            input: payload.value,
            message: 'Expected an integer',
          });
        } else if (!clampLimits && payload.value > LIMIT_CAP) {
          payload.issues.push({
            code: 'too_big',
            origin: 'number',
            maximum: LIMIT_CAP,
            inclusive: true,
            input: payload.value,
            message: `Too big: expected number to be <=${LIMIT_CAP}`,
          });
        }
      })
      .default(50)
      .meta({
        type: 'integer',
        get maximum() {
          return clampLimits ? undefined : LIMIT_CAP;
        },
        get description() {
          return clampLimits
            ? `Agencies per page. Defaults to 50; a larger value returns at most ${LIMIT_CAP} and says so.`
            : `Agencies per page (1–${LIMIT_CAP}). Defaults to 50.`;
        },
      }),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe(
        'Zero-based position in the sorted matches; pass next_offset from the previous page. Defaults to 0.',
      ),
  }),

  output: z.object({
    state_abbr: z.string().describe('State code the directory was fetched for, uppercased.'),
    total: z
      .number()
      .describe('Agencies matching the filters across the whole state directory, before paging.'),
    offset: z.number().describe('Zero-based position of the first agency on this page.'),
    next_offset: z
      .number()
      .optional()
      .describe('Offset of the next page; absent on the last page.'),
    agencies: z
      .array(
        z
          .object({
            ori: z
              .string()
              .describe(
                'Nine-character ORI code; pass it as ori with scope "agency" to fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests, fbi_get_nibrs_breakdown, or fbi_get_police_employees.',
              ),
            agency_name: z.string().describe('Agency name as CDE lists it.'),
            agency_type: z.string().describe('CDE agency type, e.g. City, County, State Police.'),
            counties: z
              .array(z.string())
              .describe(
                'Counties the agency serves, as CDE lists them; NOT SPECIFIED when CDE ties the agency to no county.',
              ),
            is_nibrs: z.boolean().describe('Whether CDE marks the agency as a NIBRS reporter.'),
            nibrs_start_date: z
              .string()
              .optional()
              .describe(
                'Date the agency began NIBRS reporting (YYYY-MM-DD); absent when CDE lists none.',
              ),
          })
          .describe('One agency from the CDE directory.'),
      )
      .describe('This page of matching agencies, sorted by agency name, then ORI.'),
  }),

  enrichment: {
    notice: z
      .string()
      .optional()
      .describe(
        'Why the page is empty or partial or its limit was lowered, and the call to make next.',
      ),
    truncated: z
      .boolean()
      .optional()
      .describe('True when more matching agencies follow this page; continue from next_offset.'),
    shown: z.number().optional().describe('Agencies on this page.'),
    cap: z.number().optional().describe('The limit applied to this page.'),
  },

  async handler(input, ctx) {
    const stateAbbr = input.state_abbr.toUpperCase();
    const nameTokens = [...new Set((input.name_contains ?? '').toLowerCase().split(/\s+/))].filter(
      Boolean,
    );
    const countyFilter = input.county?.trim();
    // Validation already rejected a limit above the cap unless clamping is on.
    const limit = Math.min(input.limit, LIMIT_CAP);
    const clampNotice =
      limit < input.limit
        ? `Requested limit ${input.limit} exceeds the ${LIMIT_CAP}-agency page maximum; applied limit ${limit}.`
        : undefined;
    ctx.log.info('fbi_search_agencies', {
      state_abbr: stateAbbr,
      name_tokens: nameTokens.length,
      county: countyFilter !== undefined,
      agency_type: input.agency_type,
      limit: input.limit,
      offset: input.offset,
    });
    if (clampNotice !== undefined) {
      ctx.log.info('fbi_search_agencies limit clamped', { requested: input.limit, applied: limit });
      limitClamps.add(1, { [ATTR_MCP_TOOL_NAME]: 'fbi_search_agencies' });
    }

    const directory = await getFbiApiService().getAgencyDirectory(stateAbbr, ctx);
    const listed = (directory ?? []).map(toAgency);
    const county = countyFilter === undefined ? undefined : countyFilterKey(countyFilter, listed);
    const matches = listed
      .filter((agency) => {
        if (input.agency_type !== undefined && agency.agency_type !== input.agency_type)
          return false;
        if (county !== undefined && !agency.counties.some((c) => countyKey(c) === county))
          return false;
        const name = agency.agency_name.toLowerCase();
        return nameTokens.every((token) => name.includes(token));
      })
      .sort(byNameThenOri);

    const total = matches.length;
    const agencies = matches.slice(input.offset, input.offset + limit);
    const end = input.offset + agencies.length;
    const nextOffset = agencies.length > 0 && end < total ? end : undefined;

    // ctx.enrich keeps only the last notice, so the clamp joins the page's own notice text.
    const withClamp = (text?: string) => [clampNotice, text].filter(Boolean).join(' ');
    let pageNotice: string | undefined;
    if (directory === null) {
      pageNotice = `CDE returned no agency directory for ${stateAbbr}; it serves none for AS, MP, or codes it does not recognize. Retry with a state, DC, PR, GU, or VI code.`;
    } else if (total === 0) {
      const filters = [
        nameTokens.length > 0 && `name_contains "${nameTokens.join(' ')}"`,
        countyFilter !== undefined && `county "${countyFilter}"`,
        input.agency_type !== undefined && `agency_type "${input.agency_type}"`,
      ].filter(Boolean);
      const hints = [
        nameTokens.length > 0 && 'name_contains needs every word in the agency name',
        countyFilter !== undefined &&
          "county must equal one of the agency's county names, which CDE lists without a County, Parish, or Borough suffix and with CITY kept on independent cities (FAIRFAX CITY beside FAIRFAX)",
      ].filter(Boolean);
      pageNotice =
        filters.length > 0
          ? `No ${stateAbbr} agencies matched ${filters.join(', ')} among the ${directory.length} in its directory. Drop or relax a filter${hints.length > 0 ? `: ${hints.join('; ')}` : ''}.`
          : `CDE's ${stateAbbr} directory lists no agencies.`;
    } else if (agencies.length === 0) {
      pageNotice = `offset ${input.offset} is past the end of the ${total} matching ${stateAbbr} agencies. Retry with an offset below ${total}, or 0 for the first page.`;
    }

    if (nextOffset !== undefined) {
      ctx.enrich.truncated({
        shown: agencies.length,
        cap: limit,
        guidance: withClamp(
          `Showing ${input.offset + 1}–${end} of ${total} matching agencies. Call again with offset: ${nextOffset} for the next page, or narrow with name_contains, county, or agency_type.`,
        ),
      });
    } else {
      const notice = withClamp(pageNotice);
      if (notice) ctx.enrich.notice(notice);
    }

    return {
      state_abbr: stateAbbr,
      total,
      offset: input.offset,
      ...(nextOffset !== undefined && { next_offset: nextOffset }),
      agencies,
    };
  },

  format: (result) => {
    const lines = [
      `## FBI CDE agencies — ${result.state_abbr}`,
      `**Total matches:** ${result.total} | **Offset:** ${result.offset} | **On this page:** ${result.agencies.length}`,
    ];
    if (result.next_offset !== undefined) lines.push(`**Next offset:** ${result.next_offset}`);
    if (result.agencies.length > 0) {
      lines.push(
        '',
        '| ORI | Agency | Type | Counties | NIBRS | NIBRS start |',
        '|:----|:-------|:-----|:---------|:-----:|:------------|',
      );
      for (const a of result.agencies) {
        lines.push(
          `| ${cell(a.ori)} | ${cell(a.agency_name)} | ${cell(a.agency_type)} | ${cell(a.counties.join(', '))} | ${a.is_nibrs ? 'Yes' : 'No'} | ${a.nibrs_start_date === undefined ? '—' : cell(a.nibrs_start_date)} |`,
        );
      }
      lines.push('', '— means CDE lists no NIBRS start date.');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
