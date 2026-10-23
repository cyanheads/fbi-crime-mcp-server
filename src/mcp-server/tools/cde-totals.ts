/**
 * @fileoverview Shared output pieces for CDE `type=totals` breakdown tools: the scope/window echo,
 * category-count map schemas, markdown count tables, the all-zero and all-null checks, the all-zero
 * notice, and the code-to-label listing that makes an opaque selector enum readable in its
 * description.
 * @module mcp-server/tools/cde-totals
 */

import { z } from '@cyanheads/mcp-ts-core';
import type { ResolvedScopedRange } from '@/mcp-server/tools/cde-scoped-range.js';

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

/** Notice for an all-zero payload; below national scope, zeros also mean an unknown identifier. */
export function zeroCountsNotice(scope: ResolvedScopedRange['scope']): string {
  if (scope === 'agency')
    return 'Every count is zero. CDE returns zeros both when the agency reported nothing for this window and when it does not recognize the ORI; confirm the ORI with fbi_search_agencies.';
  if (scope === 'state')
    return 'Every count is zero. CDE returns zeros both when nothing was reported for this window and when it does not recognize the state code; confirm state_abbr is a US state or territory abbreviation.';
  return 'Every count is zero: CDE reported none for this selection and window.';
}
