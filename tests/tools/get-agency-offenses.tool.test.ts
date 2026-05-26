/**
 * @fileoverview Tests for fbi_get_agency_offenses tool.
 * @module tests/tools/get-agency-offenses.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetAgencyOffenses } from '@/mcp-server/tools/definitions/get-agency-offenses.tool.js';

const mockGetSummarizedNational = vi.fn();
const mockGetSummarizedState = vi.fn();
const mockGetSummarizedAgency = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getSummarizedNational: mockGetSummarizedNational,
    getSummarizedState: mockGetSummarizedState,
    getSummarizedAgency: mockGetSummarizedAgency,
  }),
}));

/** FbiSummarizedResponse with agency-level offense data. */
const mockAgencyResponse = {
  offenses: {
    rates: {
      'LAPD Offenses': { '01-2022': 250.0, '02-2022': 260.5 },
      'LAPD Clearances': { '01-2022': 60.0, '02-2022': 62.0 },
    },
    actuals: {
      'LAPD Offenses': { '01-2022': 512, '02-2022': 524 },
      'LAPD Clearances': { '01-2022': 88, '02-2022': 92 },
    },
  },
};

const mockStateResponse = {
  offenses: {
    rates: {
      'California Offenses': { '01-2022': 420.0 },
    },
    actuals: {
      'California Offenses': { '01-2022': 17500 },
    },
  },
};

describe('fbiGetAgencyOffenses', () => {
  beforeEach(() => {
    mockGetSummarizedNational.mockReset();
    mockGetSummarizedState.mockReset();
    mockGetSummarizedAgency.mockReset();
  });

  it('returns monthly offense rows for agency scope by ORI', async () => {
    mockGetSummarizedAgency.mockResolvedValue(mockAgencyResponse);
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      scope: 'agency',
      offense: 'burglary',
      ori: 'CA0010400',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 2,
    });
    const result = await fbiGetAgencyOffenses.handler(input, ctx);
    expect(result.scope).toBe('agency');
    expect(result.ori).toBe('CA0010400');
    expect(result.offense).toBe('burglary');
    expect(result.months).toHaveLength(2);
    expect(result.total_months).toBe(2);
    const jan = result.months.find((m) => m.month === 1 && m.year === 2022);
    expect(jan?.rate_per_100k).toBe(250.0);
    expect(jan?.actual_count).toBe(512);
  });

  it('returns monthly offense rows for state scope', async () => {
    mockGetSummarizedState.mockResolvedValue(mockStateResponse);
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 1,
    });
    const result = await fbiGetAgencyOffenses.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.months).toHaveLength(1);
  });

  it('throws scope_param_missing when scope is agency but ori is missing', async () => {
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      scope: 'agency',
      offense: 'burglary',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetAgencyOffenses.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws scope_param_missing when scope is state but state_abbr is missing', async () => {
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      scope: 'state',
      offense: 'robbery',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetAgencyOffenses.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws no_data when summarized endpoint returns empty rate/actual maps', async () => {
    mockGetSummarizedAgency.mockResolvedValue({
      offenses: { rates: {}, actuals: {} },
    });
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      scope: 'agency',
      offense: 'burglary',
      ori: 'XX9999999',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetAgencyOffenses.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats output with scope, ori, and monthly table', () => {
    const output = fbiGetAgencyOffenses.output.parse({
      scope: 'agency',
      offense: 'burglary',
      ori: 'CA0010400',
      from: '01-2022',
      to: '02-2022',
      months: [
        {
          year: 2022,
          month: 1,
          rate_per_100k: 250.0,
          clearance_rate_per_100k: 60.0,
          actual_count: 512,
          clearance_count: 88,
        },
      ],
      total_months: 1,
    });
    const blocks = fbiGetAgencyOffenses.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**Scope:** agency');
    expect(text).toContain('**ORI:** CA0010400');
    expect(text).toContain('burglary');
    expect(text).toContain('512');
  });

  it('formats state scope output with state_abbr', () => {
    const output = fbiGetAgencyOffenses.output.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from: '01-2022',
      to: '01-2022',
      months: [{ year: 2022, month: 1, rate_per_100k: 420.0, actual_count: 17500 }],
      total_months: 1,
    });
    const blocks = fbiGetAgencyOffenses.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**State:** CA');
    expect(text).toContain('17,500');
  });

  it('formats sparse monthly row with dashes for missing values', () => {
    const output = fbiGetAgencyOffenses.output.parse({
      scope: 'national',
      offense: 'homicide',
      from: '01-2022',
      to: '01-2022',
      months: [{ year: 2022, month: 1 }],
      total_months: 1,
    });
    const blocks = fbiGetAgencyOffenses.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2022');
    expect(text).toContain('—');
  });
});
