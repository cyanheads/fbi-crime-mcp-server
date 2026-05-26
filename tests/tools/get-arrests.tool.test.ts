/**
 * @fileoverview Tests for fbi_get_arrests tool.
 * @module tests/tools/get-arrests.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';

const mockGetArrestsNational = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getArrestsNational: mockGetArrestsNational }),
}));

describe('fbiGetArrests', () => {
  beforeEach(() => {
    mockGetArrestsNational.mockReset();
  });

  it('returns national arrest rows', async () => {
    mockGetArrestsNational.mockResolvedValue([
      {
        year: 2022,
        offense: 'Burglary',
        male_adult: 45000,
        female_adult: 9000,
        male_juv: 5000,
        female_juv: 1500,
        white: 32000,
        black: 24000,
        total: 60500,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({ since_year: 2022, until_year: 2022 });
    const result = await fbiGetArrests.handler(input, ctx);
    expect(result.arrests).toHaveLength(1);
    expect(result.arrests[0]?.year).toBe(2022);
    expect(result.arrests[0]?.offense).toBe('Burglary');
    expect(result.totalRows).toBe(1);
    expect(result.note).toBeDefined();
  });

  it('returns arrests without year range filter', async () => {
    mockGetArrestsNational.mockResolvedValue([
      { year: 2021, offense: 'Robbery', total: 80000 },
      { year: 2022, offense: 'Robbery', total: 75000 },
    ]);
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({});
    const result = await fbiGetArrests.handler(input, ctx);
    expect(result.arrests).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it('throws no_data when API returns empty results', async () => {
    mockGetArrestsNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({ since_year: 1999, until_year: 1999 });
    await expect(fbiGetArrests.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats output with table headers and year/offense columns', () => {
    const output = fbiGetArrests.output.parse({
      arrests: [
        {
          year: 2022,
          offense: 'Burglary',
          male_adult: 45000,
          female_adult: 9000,
          white: 32000,
          black: 24000,
          total: 60500,
        },
      ],
      totalRows: 1,
      note: 'National-only data.',
    });
    const blocks = fbiGetArrests.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2022');
    expect(text).toContain('Burglary');
    expect(text).toContain('National');
  });

  it('formats sparse arrest row without crashing', () => {
    const output = fbiGetArrests.output.parse({
      arrests: [{ year: 2020, offense: 'Larceny' }],
      totalRows: 1,
      note: 'National-only data.',
    });
    const blocks = fbiGetArrests.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2020');
    expect(text).toContain('Larceny');
    expect(text).toContain('—');
  });
});
