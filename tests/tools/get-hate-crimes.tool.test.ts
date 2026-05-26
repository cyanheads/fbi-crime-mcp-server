/**
 * @fileoverview Tests for fbi_get_hate_crimes tool.
 * @module tests/tools/get-hate-crimes.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';

const mockGetHateCrimesNational = vi.fn();
const mockGetHateCrimesState = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getHateCrimesNational: mockGetHateCrimesNational,
    getHateCrimesState: mockGetHateCrimesState,
  }),
}));

describe('fbiGetHateCrimes', () => {
  beforeEach(() => {
    mockGetHateCrimesNational.mockReset();
    mockGetHateCrimesState.mockReset();
  });

  it('returns national hate crime incidents', async () => {
    mockGetHateCrimesNational.mockResolvedValue([
      {
        data_year: 2022,
        bias_motivation: 'Anti-Black or African American',
        total_individual_incidents: 2000,
        total_offenses: 2200,
        total_victims: 2400,
        total_known_offenders: 1800,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({ scope: 'national', cross_offense: false });
    const result = await fbiGetHateCrimes.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]?.bias_motivation).toBe('Anti-Black or African American');
    expect(result.totalRows).toBe(1);
    expect(result.caveat).toBeDefined();
    expect(result.cross_offense).toBe(false);
  });

  it('returns state hate crime incidents', async () => {
    mockGetHateCrimesState.mockResolvedValue([
      { data_year: 2022, bias_motivation: 'Anti-Jewish', total_individual_incidents: 120 },
    ]);
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({
      scope: 'state',
      state_abbr: 'NY',
      cross_offense: false,
    });
    const result = await fbiGetHateCrimes.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('NY');
    expect(result.incidents).toHaveLength(1);
  });

  it('throws state_required when scope is state but state_abbr missing', async () => {
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({ scope: 'state', cross_offense: false });
    await expect(fbiGetHateCrimes.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'state_required' },
    });
  });

  it('returns empty incidents with message when no data found', async () => {
    mockGetHateCrimesNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({
      scope: 'national',
      since_year: 2030,
      until_year: 2030,
      cross_offense: false,
    });
    const result = await fbiGetHateCrimes.handler(input, ctx);
    expect(result.incidents).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  it('formats output with bias_motivation and incident counts', () => {
    const output = fbiGetHateCrimes.output.parse({
      scope: 'national',
      incidents: [
        {
          data_year: 2022,
          bias_motivation: 'Anti-Black or African American',
          total_individual_incidents: 2000,
          total_offenses: 2200,
          total_victims: 2400,
          total_known_offenders: 1800,
        },
      ],
      totalRows: 1,
      cross_offense: false,
      caveat: 'Hate crime reporting is voluntary.',
    });
    const blocks = fbiGetHateCrimes.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('National');
    expect(text).toContain('Anti-Black or African American');
    expect(text).toContain('2022');
  });

  it('formats cross-offense breakdown with offense_name column', () => {
    const output = fbiGetHateCrimes.output.parse({
      scope: 'national',
      incidents: [
        {
          data_year: 2022,
          bias_motivation: 'Anti-Jewish',
          offense_name: 'Vandalism',
          total_individual_incidents: 85,
        },
      ],
      totalRows: 1,
      cross_offense: true,
      caveat: 'Hate crime reporting is voluntary.',
    });
    const blocks = fbiGetHateCrimes.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Vandalism');
    expect(text).toContain('Anti-Jewish');
    expect(text).toContain('Offense Type');
  });
});
