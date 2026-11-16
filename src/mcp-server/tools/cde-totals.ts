/**
 * @fileoverview Shared output pieces for CDE `type=totals` breakdown tools: the scope/window echo,
 * category-count map schemas, markdown count tables and number cells, the all-zero and all-null
 * checks, the all-zero notice, and the code-to-label listing that makes an opaque selector enum
 * readable in its description.
 * @module mcp-server/tools/cde-totals
 */

import { z } from '@cyanheads/mcp-ts-core';
import type { ResolvedScopedRange } from '@/mcp-server/tools/cde-scoped-range.js';
import type { CdeScope } from '@/services/fbi-api/types.js';

/** Category label to count; null means CDE sent no value, never zero. */
export type CountMap = Record<string, number | null>;

/** Output fields echoing the applied scope, normalized identifier, and summed window. */
export const scopeEchoFields = {
  scope: z.enum(['national', 'state', 'agency']).describe('Geographic scope queried.'),
  state_abbr: z
    .string()
    .optional()
    .describe('Uppercased state abbreviation; present only for state scope.'),
  ori: z.string().optional().describe('Uppercased ORI code; present only for agency scope.'),
  from: z.string().describe('First month of the summed window (MM-YYYY).'),
  to: z.string().describe('Last month of the summed window (MM-YYYY).'),
};

/** The echo fields for a resolved range, carrying only the identifier its scope uses. */
export function scopeEcho(range: ResolvedScopedRange) {
  return {
    scope: range.scope,
    ...(range.scope === 'state' && { state_abbr: range.stateAbbr }),
    ...(range.scope === 'agency' && { ori: range.ori }),
    from: range.from,
    to: range.to,
  };
}

/** Output schema for one CDE dimension: every category CDE sent, zeros and nulls as sent. */
export function countMap(description: string) {
  return z.record(z.string(), z.number().nullable()).describe(description);
}

/** `"11 Anti-White; 12 …"` — every code with its label, for a selector's `.describe()`. */
export function codeListing(labels: Readonly<Record<string, string>>): string {
  return Object.entries(labels)
    .map(([code, label]) => `${code} ${label}`)
    .join('; ');
}

/** Every number as CDE sent it, grouped in en-US whatever the host locale. */
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 });

/** A table cell for a number CDE may not have sent: en-US digits, or `—` for null. */
export const formatNumber = (value: number | null) => (value === null ? '—' : NUMBER.format(value));

/** {@link formatNumber} for a percentage. */
export const formatPercent = (value: number | null) =>
  value === null ? '—' : `${NUMBER.format(value)}%`;

/** `the nation`, `state TX`, or `agency CA0010400`, for no-data messages. */
export function scopeLabel(range: CdeScope): string {
  if (range.scope === 'agency') return `agency ${range.ori}`;
  if (range.scope === 'state') return `state ${range.stateAbbr}`;
  return 'the nation';
}

/** Escape CDE-authored text for markdown; structured output keeps it verbatim. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&').replace(/\r\n|\r|\n/g, ' ');
}

/** The scope fields of any tool output, whether its `scope` is an enum or a plain string. */
interface ScopeEcho {
  ori?: string | undefined;
  scope: string;
  state_abbr?: string | undefined;
}

/** Heading suffix for a scope: `National`, the state abbreviation, or `ORI: …`. */
export function scopeHeading(echo: ScopeEcho): string {
  if (echo.scope === 'state') return echo.state_abbr ?? echo.scope;
  if (echo.scope === 'agency') return `ORI: ${echo.ori ?? echo.scope}`;
  return 'National';
}

/** `**Scope:** state | **State:** TX` — the scope line every breakdown format opens with. */
export function scopeLine(echo: ScopeEcho): string {
  return `**Scope:** ${echo.scope}${echo.state_abbr ? ` | **State:** ${echo.state_abbr}` : ''}${echo.ori ? ` | **ORI:** ${echo.ori}` : ''}`;
}

/** One markdown table for a dimension: every category in CDE's order, null rendered `—`. */
export function countTable(heading: string, counts: CountMap): string[] {
  const rows = Object.entries(counts);
  if (rows.length === 0) return ['', `### ${heading}`, 'CDE returned no categories.'];
  return [
    '',
    `### ${heading}`,
    '| Category | Count |',
    '|:---------|------:|',
    ...rows.map(
      ([category, count]) =>
        `| ${escapeMarkdown(category)} | ${count === null ? '—' : count.toLocaleString('en-US')} |`,
    ),
  ];
}

function everyCountIs(maps: readonly CountMap[], value: 0 | null): boolean {
  const counts = maps.flatMap((map) => Object.values(map));
  return counts.length > 0 && counts.every((count) => count === value);
}

/** True when the maps hold at least one count and every count is exactly zero. */
export function allCountsZero(maps: readonly CountMap[]): boolean {
  return everyCountIs(maps, 0);
}

/** True when the maps hold at least one count and every count is null. */
export function allCountsNull(maps: readonly CountMap[]): boolean {
  return everyCountIs(maps, null);
}

/**
 * What CDE's `type=counts` view says about the scoped state or ORI: `unchecked` when the counts
 * view was not requested, `unrecognized` when it names no series for the identifier, `unreported`
 * when it names one but no month of the window has a participating population.
 */
export type IdentifierCheck = 'unchecked' | 'recognized' | 'unreported' | 'unrecognized';

/**
 * Notice for an all-zero payload. Below national scope the totals view alone cannot tell no
 * reports from an unknown identifier; the counts view's {@link IdentifierCheck} settles it.
 */
export function zeroCountsNotice(
  scope: ResolvedScopedRange['scope'],
  check: IdentifierCheck,
): string {
  if (scope === 'national')
    return 'Every count is zero: CDE reported none for this selection and window.';
  if (scope === 'agency') {
    if (check === 'unreported')
      return 'Every count is zero, but these are not reported counts: CDE recognizes the ORI, and the agency reported for no month of this window (participated_population is null in every monthly row).';
    if (check === 'recognized')
      return 'Every count is zero, and CDE recognizes the ORI: the agency reported none for this selection and window. A month in monthly whose participated_population is null is one the agency did not report, not a reported zero.';
    if (check === 'unrecognized')
      return 'Every count is zero because CDE does not recognize the ORI: its monthly view names no agency for it. Confirm the ORI with fbi_search_agencies.';
    return 'Every count is zero. CDE returns zeros both when the agency reported nothing for this window and when it does not recognize the ORI; confirm the ORI with fbi_search_agencies.';
  }
  if (check === 'unreported')
    return 'Every count is zero, but these are not reported counts: CDE recognizes the state, and no agency in it reported for any month of this window (participated_population is null in every monthly row).';
  if (check === 'recognized')
    return 'Every count is zero, and CDE recognizes the state: none was reported for this selection and window. A month in monthly whose participated_population is null had no reporting agencies, not a reported zero.';
  if (check === 'unrecognized')
    return 'Every count is zero because CDE does not recognize the state code: its monthly view names no state for it. Confirm state_abbr is a US state or territory abbreviation.';
  return 'Every count is zero. CDE returns zeros both when nothing was reported for this window and when it does not recognize the state code; confirm state_abbr is a US state or territory abbreviation.';
}
