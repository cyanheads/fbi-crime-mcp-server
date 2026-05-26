/**
 * @fileoverview Tests for fbi_get_crime_estimates tool.
 * @module tests/tools/get-crime-estimates.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';

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

/** FbiSummarizedResponse with monthly data for violent-crime national. */
const mockNationalResponse = {
  cde_properties: {
    last_refresh_date: { UCR: '2024-01-15' },
    max_data_date: { UCR: '2023-12-31' },
  },
  offenses: {
    rates: {
      'United States Offenses': { '01-2022': 387.5, '02-2022': 392.1 },
      'United States Clearances': { '01-2022': 95.2, '02-2022': 98.0 },
    },
    actuals: {
      'United States Offenses': { '01-2022': 102500, '02-2022': 103200 },
      'United States Clearances': { '01-2022': 28000, '02-2022': 29100 },
    },
  },
};

/** FbiSummarizedResponse with state-level data. */
const mockStateResponse = {
  offenses: {
    rates: {
      'California Offenses': { '01-2022': 420.0 },
      'California Clearances': { '01-2022': 100.0 },
    },
    actuals: {
      'California Offenses': { '01-2022': 17500 },
      'California Clearances': { '01-2022': 4200 },
    },
  },
};

describe('fbiGetCrimeEstimates', () => {
  beforeEach(() => {
    mockGetSummarizedNational.mockReset();
    mockGetSummarizedState.mockReset();
    mockGetSummarizedAgency.mockReset();
  });

  it('returns national monthly estimates', async () => {
    mockGetSummarizedNational.mockResolvedValue(mockNationalResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'violent-crime',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 2,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.offense).toBe('violent-crime');
    expect(result.months).toHaveLength(2);
    expect(result.total_months).toBe(2);
    expect(result.data_last_updated).toBe('2024-01-15');
    const jan = result.months.find((m) => m.month === 1 && m.year === 2022);
    expect(jan?.rate_per_100k).toBe(387.5);
    expect(jan?.actual_count).toBe(102500);
  });

  it('returns state estimates', async () => {
    mockGetSummarizedState.mockResolvedValue(mockStateResponse);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 1,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.months).toHaveLength(1);
    expect(result.months[0]?.rate_per_100k).toBe(420.0);
  });

  it('throws scope_param_missing when state scope lacks state_abbr', async () => {
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'state',
      offense: 'robbery',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws scope_param_missing when agency scope lacks ori', async () => {
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'agency',
      offense: 'burglary',
      from_year: 2022,
      to_year: 2022,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_param_missing' },
    });
  });

  it('throws no_data when summarized endpoint returns empty rate/actual maps', async () => {
    mockGetSummarizedNational.mockResolvedValue({
      offenses: { rates: {}, actuals: {} },
    });
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'homicide',
      from_year: 2030,
      to_year: 2030,
    });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats output with scope, offense, and monthly table', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'state',
      offense: 'violent-crime',
      state_abbr: 'CA',
      from: '01-2022',
      to: '01-2022',
      months: [
        {
          year: 2022,
          month: 1,
          rate_per_100k: 420.0,
          clearance_rate_per_100k: 100.0,
          actual_count: 17500,
          clearance_count: 4200,
        },
      ],
      total_months: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**Scope:** state');
    expect(text).toContain('**State:** CA');
    expect(text).toContain('violent-crime');
    expect(text).toContain('420');
    expect(text).toContain('17,500');
  });

  it('formats sparse monthly row with dashes for missing values', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'national',
      offense: 'robbery',
      from: '01-2022',
      to: '01-2022',
      months: [{ year: 2022, month: 1 }],
      total_months: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2022');
    expect(text).toContain('—');
  });

  it('months are sorted chronologically', async () => {
    mockGetSummarizedNational.mockResolvedValue({
      offenses: {
        rates: {
          'United States Offenses': {
            '03-2022': 400.0,
            '01-2022': 380.0,
            '02-2022': 390.0,
          },
        },
        actuals: { 'United States Offenses': { '01-2022': 100, '02-2022': 101, '03-2022': 102 } },
      },
    });
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({
      scope: 'national',
      offense: 'robbery',
      from_year: 2022,
      from_month: 1,
      to_year: 2022,
      to_month: 3,
    });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.months[0]?.month).toBe(1);
    expect(result.months[1]?.month).toBe(2);
    expect(result.months[2]?.month).toBe(3);
  });
});
