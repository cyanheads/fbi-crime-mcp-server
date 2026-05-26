/**
 * @fileoverview Tests for fbi_get_crime_estimates tool.
 * @module tests/tools/get-crime-estimates.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetCrimeEstimates } from '@/mcp-server/tools/definitions/get-crime-estimates.tool.js';

const mockGetEstimatesNational = vi.fn();
const mockGetEstimatesState = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getEstimatesNational: mockGetEstimatesNational,
    getEstimatesState: mockGetEstimatesState,
  }),
}));

describe('fbiGetCrimeEstimates', () => {
  beforeEach(() => {
    mockGetEstimatesNational.mockReset();
    mockGetEstimatesState.mockReset();
  });

  it('returns national estimates', async () => {
    mockGetEstimatesNational.mockResolvedValue([
      {
        year: 2022,
        population: 330000000,
        violent_crime: 1300000,
        homicide: 22000,
        rape_legacy: 95000,
        rape_revised: 140000,
        robbery: 250000,
        property_crime: 6500000,
        burglary: 1200000,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({ scope: 'national' });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.estimates).toHaveLength(1);
    expect(result.estimates[0]?.year).toBe(2022);
    expect(result.note).toBeDefined(); // rape_legacy + rape_revised present
  });

  it('throws state_required when state scope has no state_abbr', async () => {
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({ scope: 'state' });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'state_required' },
    });
  });

  it('throws no_data when API returns empty results', async () => {
    mockGetEstimatesNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({ scope: 'national' });
    await expect(fbiGetCrimeEstimates.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('returns state estimates for valid state', async () => {
    mockGetEstimatesState.mockResolvedValue([
      { year: 2022, population: 40000000, violent_crime: 190000 },
    ]);
    const ctx = createMockContext({ errors: fbiGetCrimeEstimates.errors });
    const input = fbiGetCrimeEstimates.input.parse({ scope: 'state', state_abbr: 'CA' });
    const result = await fbiGetCrimeEstimates.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
  });

  it('formats output with scope, state_abbr, rape_legacy, and rape_revised columns', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'state',
      state_abbr: 'CA',
      estimates: [{ year: 2022, rape_legacy: 80000, rape_revised: 120000, violent_crime: 190000 }],
      totalYears: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**Scope:** state');
    expect(text).toContain('**State:** CA');
    expect(text).toContain('Rape (Legacy)');
    expect(text).toContain('Rape (Revised)');
  });

  it('formats sparse estimates row without crashing', () => {
    const output = fbiGetCrimeEstimates.output.parse({
      scope: 'national',
      estimates: [{ year: 2020 }],
      totalYears: 1,
    });
    const blocks = fbiGetCrimeEstimates.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2020');
  });
});
