/**
 * @fileoverview FBI agency search over the CDE state agency directory.
 * Fetches one state's full directory, filters it locally by name words, county, and
 * agency type, sorts by name then ORI, and returns one page — the ORI discovery step
 * for agency scope in fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests, and
 * fbi_get_nibrs_breakdown.
 * @module mcp-server/tools/definitions/search-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';
import type { FbiDirectoryAgency } from '@/services/fbi-api/types.js';

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

/** CDE-authored text in a table cell: escape inline markdown and flatten line breaks. */
function cell(value: string): string {
  return value.replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/\r\n|\r|\n/g, ' ');
}

export const fbiSearchAgencies = tool('fbi_search_agencies', {
  title: 'FBI Search Agencies',
  description:
    "Find law enforcement agencies in one state and their nine-character ORI codes, the identifier agency scope needs in fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests, and fbi_get_nibrs_breakdown. Fetches the state's full FBI CDE agency directory, filters it by words in the agency name, county, and agency type, sorts by agency name then ORI, and returns one page with the total match count and next_offset for the following page. Each agency carries its type, counties, and NIBRS reporting status. A code CDE has no directory for (AS, MP, or an unrecognized code) returns zero agencies with a notice.",
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
      "County name, case-insensitive (e.g. Bexar). Matches an agency when it equals any of the agency's counties, so an agency serving several counties matches each of them.",
    ),
    agency_type: blankOrSpaceAsUnset(z.enum(AGENCY_TYPES).optional()).describe(
      'Agency type: City, County, Other State Agency, Other, State Police, University or College, or Tribal.',
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe('Agencies per page (1–200). Defaults to 50.'),
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
                'Nine-character ORI code; pass it as ori with scope "agency" to fbi_get_crime_estimates, fbi_get_hate_crimes, fbi_get_arrests, or fbi_get_nibrs_breakdown.',
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
      .describe('Why the page is empty or partial, and the call to make next.'),
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
    const county = countyFilter?.toLowerCase();
    ctx.log.info('fbi_search_agencies', {
      state_abbr: stateAbbr,
      name_tokens: nameTokens.length,
      county: county !== undefined,
      agency_type: input.agency_type,
      limit: input.limit,
      offset: input.offset,
    });

    const directory = await getFbiApiService().getAgencyDirectory(stateAbbr, ctx);
    const matches = (directory ?? [])
      .map(toAgency)
      .filter((agency) => {
        if (input.agency_type !== undefined && agency.agency_type !== input.agency_type)
          return false;
        if (county !== undefined && !agency.counties.some((c) => c.toLowerCase() === county))
          return false;
        const name = agency.agency_name.toLowerCase();
        return nameTokens.every((token) => name.includes(token));
      })
      .sort(byNameThenOri);

    const total = matches.length;
    const agencies = matches.slice(input.offset, input.offset + input.limit);
    const end = input.offset + agencies.length;
    const nextOffset = agencies.length > 0 && end < total ? end : undefined;

    if (directory === null) {
      ctx.enrich.notice(
        `CDE returned no agency directory for ${stateAbbr}; it serves none for AS, MP, or codes it does not recognize. Retry with a state, DC, PR, GU, or VI code.`,
      );
    } else if (total === 0) {
      const filters = [
        nameTokens.length > 0 && `name_contains "${nameTokens.join(' ')}"`,
        countyFilter !== undefined && `county "${countyFilter}"`,
        input.agency_type !== undefined && `agency_type "${input.agency_type}"`,
      ].filter(Boolean);
      ctx.enrich.notice(
        filters.length > 0
          ? `No ${stateAbbr} agencies matched ${filters.join(', ')} among the ${directory.length} in its directory. Drop or relax a filter: name_contains needs every word in the agency name, and county must equal one of the agency's county names.`
          : `CDE's ${stateAbbr} directory lists no agencies.`,
      );
    } else if (agencies.length === 0) {
      ctx.enrich.notice(
        `offset ${input.offset} is past the end of the ${total} matching ${stateAbbr} agencies. Retry with an offset below ${total}, or 0 for the first page.`,
      );
    } else if (nextOffset !== undefined) {
      ctx.enrich.truncated({
        shown: agencies.length,
        cap: input.limit,
        guidance: `Showing ${input.offset + 1}–${end} of ${total} matching agencies. Call again with offset: ${nextOffset} for the next page, or narrow with name_contains, county, or agency_type.`,
      });
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
