/**
 * @fileoverview Shared input contract for CDE tools that take a national/state/agency scope and a
 * year/month range: the input fields (with each endpoint's year floor), identifier normalization,
 * and the pre-fetch checks for scope parameters, the current-year ceiling, and range order.
 * Each tool still declares the matching `errors[]` entries inline; the `ctx` parameter types
 * below fail to compile when one is missing.
 * @module mcp-server/tools/cde-scoped-range
 */

import { type TypedFail, z } from '@cyanheads/mcp-ts-core';
import type { CdeScopedWindow } from '@/services/fbi-api/types.js';

/** Reasons {@link resolveScopedRange} can fail with; each tool declares all four. */
export type ScopedRangeReason =
  | 'scope_param_missing'
  | 'scope_param_incompatible'
  | 'year_out_of_range'
  | 'invalid_date_range';

/** A blank identifier from a form client is unset, never a value to validate. */
const blankAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

/**
 * Scope, identifier, and year/month range fields for a CDE scoped endpoint. `floorYear` is the
 * endpoint's first year with data and becomes the JSON Schema `minimum` on both year fields; the
 * ceiling (the current UTC year) is checked per call by {@link resolveScopedRange}.
 */
export function scopedRangeFields(floorYear: number) {
  return {
    scope: z
      .enum(['national', 'state', 'agency'])
      .describe(
        'Geographic scope: national (omit identifiers), state (only state_abbr), or agency (only ori).',
      ),
    state_abbr: blankAsUnset(
      z
        .string()
        .length(2)
        .regex(/^[A-Za-z]{2}$/, 'Use two ASCII letters for state_abbr.')
        .optional(),
    ).describe(
      'Two ASCII-letter state abbreviation (e.g. CA, DC, PR); case-insensitive. Only permitted and required for state scope.',
    ),
    ori: blankAsUnset(
      z
        .string()
        .length(9)
        .regex(/^[A-Za-z0-9]{9}$/, 'Use nine ASCII letters or digits for ori.')
        .optional(),
    ).describe(
      "Nine ASCII-letter/digit ORI code (e.g. CA0010400, DCMPD0000); case-insensitive. Find an agency's ORI with fbi_search_agencies. Only permitted and required for agency scope.",
    ),
    from_year: z
      .number()
      .int()
      .min(floorYear)
      .describe(
        `Start year of the data range (inclusive), ${floorYear} through the current year. The API uses monthly granularity.`,
      ),
    from_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(1)
      .describe('Start month (1–12). Defaults to January.'),
    to_year: z
      .number()
      .int()
      .min(floorYear)
      .describe(`End year of the data range (inclusive), ${floorYear} through the current year.`),
    to_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(12)
      .describe('End month (1–12). Defaults to December.'),
  };
}

/** Parsed scope and range fields, as {@link scopedRangeFields} produces them. */
export type ScopedRangeInput = z.output<z.ZodObject<ReturnType<typeof scopedRangeFields>>>;

/** A validated scope with its normalized identifier and the MM-YYYY bounds CDE expects. */
export type ResolvedScopedRange = CdeScopedWindow;

/** Format a year and month as the MM-YYYY string the CDE API expects. */
function toCdeMonth(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}-${year}`;
}

/**
 * Fail with `year_out_of_range` when any year is after the current UTC year. The clock is read on
 * every call, so a long-running server never serves a stale ceiling. The hint names the window.
 */
export function assertYearsNotFuture(
  years: readonly { field: string; year: number }[],
  floorYear: number,
  ctx: { fail: TypedFail<'year_out_of_range'> },
): void {
  const currentYear = new Date().getUTCFullYear();
  const late = years.find(({ year }) => year > currentYear);
  if (late) {
    throw ctx.fail(
      'year_out_of_range',
      `${late.field} ${late.year} is after the current year (${currentYear}).`,
      { recovery: { hint: `Use years from ${floorYear} through ${currentYear}.` } },
    );
  }
}

/**
 * Validate a scoped range before any fetch and normalize its identifier to uppercase. Checks run
 * in order: the scope's identifier is present, no identifier is supplied that the scope ignores,
 * no year is after the current UTC year, and the start is no later than the end.
 */
export function resolveScopedRange(
  input: ScopedRangeInput,
  floorYear: number,
  ctx: { fail: TypedFail<ScopedRangeReason> },
): ResolvedScopedRange {
  const scope = resolveScope(input, ctx);
  assertYearsNotFuture(
    [
      { field: 'from_year', year: input.from_year },
      { field: 'to_year', year: input.to_year },
    ],
    floorYear,
    ctx,
  );
  const from = toCdeMonth(input.from_year, input.from_month);
  const to = toCdeMonth(input.to_year, input.to_month);
  if (input.from_year * 12 + input.from_month > input.to_year * 12 + input.to_month) {
    throw ctx.fail('invalid_date_range', `Start ${from} is later than end ${to}.`);
  }
  return { ...scope, from, to };
}

/** The scope's own identifier is required; any identifier the scope would ignore is rejected. */
function resolveScope(
  input: ScopedRangeInput,
  ctx: { fail: TypedFail<'scope_param_missing' | 'scope_param_incompatible'> },
) {
  const ignored = `state_abbr or ori is not applicable to scope="${input.scope}".`;
  if (input.scope === 'state') {
    if (!input.state_abbr) {
      throw ctx.fail('scope_param_missing', 'state_abbr is required when scope is "state".');
    }
    if (input.ori !== undefined) throw ctx.fail('scope_param_incompatible', ignored);
    return { scope: 'state' as const, stateAbbr: input.state_abbr.toUpperCase() };
  }
  if (input.scope === 'agency') {
    if (!input.ori)
      throw ctx.fail('scope_param_missing', 'ori is required when scope is "agency".');
    if (input.state_abbr !== undefined) throw ctx.fail('scope_param_incompatible', ignored);
    return { scope: 'agency' as const, ori: input.ori.toUpperCase() };
  }
  if (input.state_abbr !== undefined || input.ori !== undefined) {
    throw ctx.fail('scope_param_incompatible', ignored);
  }
  return { scope: 'national' as const };
}
