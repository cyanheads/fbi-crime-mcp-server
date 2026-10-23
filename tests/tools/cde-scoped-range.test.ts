/**
 * @fileoverview Tests for the shared CDE scope/date-range input contract.
 * @module tests/tools/cde-scoped-range.test
 */

import { z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertYearsNotFuture,
  resolveScopedRange,
  scopedRangeFields,
} from '@/mcp-server/tools/cde-scoped-range.js';

const errors = [
  {
    reason: 'scope_param_missing',
    code: JsonRpcErrorCode.ValidationError,
    when: 'Identifier missing.',
    recovery: 'Provide the identifier the scope requires.',
  },
  {
    reason: 'scope_param_incompatible',
    code: JsonRpcErrorCode.ValidationError,
    when: 'Identifier not applicable.',
    recovery: 'Omit identifiers the scope does not use.',
  },
  {
    reason: 'year_out_of_range',
    code: JsonRpcErrorCode.ValidationError,
    when: 'Year after the current year.',
    recovery: 'Use a year within the served window.',
  },
  {
    reason: 'invalid_date_range',
    code: JsonRpcErrorCode.ValidationError,
    when: 'Start after end.',
    recovery: 'Put the start no later than the end.',
  },
] as const;

const schema = z.object(scopedRangeFields(1991));
const base = { from_year: 2022, from_month: 1, to_year: 2022, to_month: 1 };

function resolve(input: Record<string, unknown>) {
  return resolveScopedRange(schema.parse(input), 1991, createMockContext({ errors }));
}

function failure(input: Record<string, unknown>): unknown {
  try {
    resolve(input);
  } catch (error) {
    return error;
  }
  throw new Error('expected resolveScopedRange to throw');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('scopedRangeFields', () => {
  it('uses the floor as the minimum on both year fields', () => {
    expect(schema.safeParse({ scope: 'national', ...base, from_year: 1991 }).success).toBe(true);
    for (const field of ['from_year', 'to_year'])
      expect(schema.safeParse({ scope: 'national', ...base, [field]: 1990 }).success).toBe(false);
    const properties = z.toJSONSchema(schema).properties ?? {};
    expect(properties.from_year).toMatchObject({ minimum: 1991 });
    expect(properties.to_year).toMatchObject({ minimum: 1991 });
    expect(JSON.stringify(properties.from_year)).toContain('1991 through the current year');
  });
  it('reads a blank identifier as unset and still validates a real one', () => {
    expect(schema.parse({ scope: 'national', ...base, state_abbr: '', ori: '' })).toMatchObject({
      state_abbr: undefined,
      ori: undefined,
    });
    expect(schema.safeParse({ scope: 'state', ...base, state_abbr: 'C' }).success).toBe(false);
    expect(schema.safeParse({ scope: 'agency', ...base, ori: 'CA001040!' }).success).toBe(false);
    const properties = z.toJSONSchema(schema).properties ?? {};
    expect(properties.state_abbr).toMatchObject({ pattern: '^[A-Za-z]{2}$' });
    expect(properties.ori).toMatchObject({ pattern: '^[A-Za-z0-9]{9}$' });
    expect(z.toJSONSchema(schema, { io: 'input' }).required).toEqual([
      'scope',
      'from_year',
      'to_year',
    ]);
  });
});

describe('resolveScopedRange', () => {
  it('normalizes identifiers to uppercase and formats MM-YYYY bounds', () => {
    expect(resolve({ scope: 'national', ...base, to_month: 11 })).toEqual({
      scope: 'national',
      from: '01-2022',
      to: '11-2022',
    });
    expect(resolve({ scope: 'state', ...base, state_abbr: 'pr' })).toEqual({
      scope: 'state',
      stateAbbr: 'PR',
      from: '01-2022',
      to: '01-2022',
    });
    expect(resolve({ scope: 'agency', ...base, ori: 'dcmpd0000' })).toEqual({
      scope: 'agency',
      ori: 'DCMPD0000',
      from: '01-2022',
      to: '01-2022',
    });
  });
  for (const [input, reason] of [
    [{ scope: 'state' }, 'scope_param_missing'],
    [{ scope: 'state', state_abbr: '' }, 'scope_param_missing'],
    [{ scope: 'state', ori: 'CA0010400' }, 'scope_param_missing'],
    [{ scope: 'agency' }, 'scope_param_missing'],
    [{ scope: 'national', state_abbr: 'CA' }, 'scope_param_incompatible'],
    [{ scope: 'national', ori: 'CA0010400' }, 'scope_param_incompatible'],
    [{ scope: 'state', state_abbr: 'CA', ori: 'CA0010400' }, 'scope_param_incompatible'],
    [{ scope: 'agency', ori: 'CA0010400', state_abbr: 'CA' }, 'scope_param_incompatible'],
    [{ scope: 'national', from_year: 2023, to_year: 2022 }, 'invalid_date_range'],
    [{ scope: 'national', from_month: 2, to_month: 1 }, 'invalid_date_range'],
  ] as const) {
    it(`fails ${reason} for ${JSON.stringify(input)}`, () => {
      expect(failure({ ...base, ...input })).toMatchObject({ data: { reason } });
    });
  }
  it('accepts a range that crosses a year forward', () => {
    expect(
      resolve({ scope: 'national', from_year: 2022, from_month: 12, to_year: 2023, to_month: 1 }),
    ).toMatchObject({ from: '12-2022', to: '01-2023' });
  });
  it('checks the scope, then the ceiling, then the range order', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const late = { ...base, from_year: 2027, to_year: 2026 };
    expect(failure({ scope: 'state', ...late })).toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
    expect(failure({ scope: 'national', ...late, ori: 'CA0010400' })).toMatchObject({
      data: { reason: 'scope_param_incompatible' },
    });
    expect(failure({ scope: 'national', ...late })).toMatchObject({
      data: { reason: 'year_out_of_range' },
    });
  });
});

describe('assertYearsNotFuture', () => {
  const ctx = () => createMockContext({ errors });
  it('names the field, the current year, and the window', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    expect(() =>
      assertYearsNotFuture(
        [
          { field: 'from_year', year: 2026 },
          { field: 'to_year', year: 2028 },
        ],
        1985,
        ctx(),
      ),
    ).toThrow(
      expect.objectContaining({
        message: 'to_year 2028 is after the current year (2026).',
        data: expect.objectContaining({
          reason: 'year_out_of_range',
          recovery: { hint: 'Use years from 1985 through 2026.' },
        }),
      }),
    );
  });
  for (const [now, year, passes] of [
    ['2026-12-31T23:59:59.999Z', 2027, false],
    ['2027-01-01T00:00:00.000Z', 2027, true],
    ['2026-01-01T00:00:00.000Z', 2026, true],
  ] as const) {
    it(`${passes ? 'accepts' : 'rejects'} ${year} at ${now}`, () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      const call = () => assertYearsNotFuture([{ field: 'year', year }], 2020, ctx());
      if (passes) expect(call).not.toThrow();
      else
        expect(call).toThrow(
          expect.objectContaining({
            data: expect.objectContaining({ reason: 'year_out_of_range' }),
          }),
        );
    });
  }
  it('reads the clock on every call', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = () => assertYearsNotFuture([{ field: 'year', year: 2031 }], 2020, ctx());
    vi.setSystemTime(new Date('2030-07-01T00:00:00Z'));
    expect(call).toThrow(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'year_out_of_range' }) }),
    );
    vi.setSystemTime(new Date('2031-07-01T00:00:00Z'));
    expect(call).not.toThrow();
  });
});
