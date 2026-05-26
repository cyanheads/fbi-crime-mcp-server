/**
 * @fileoverview Tests for fbi_get_leoka tool.
 * @module tests/tools/get-leoka.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetLeoka } from '@/mcp-server/tools/definitions/get-leoka.tool.js';

const mockGetLeokaMonthly = vi.fn();
const mockGetLeokaYtd = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getLeokaMonthly: mockGetLeokaMonthly,
    getLeokaYtd: mockGetLeokaYtd,
  }),
}));

describe('fbiGetLeoka', () => {
  beforeEach(() => {
    mockGetLeokaMonthly.mockReset();
    mockGetLeokaYtd.mockReset();
  });

  it('returns monthly LEOKA records', async () => {
    mockGetLeokaMonthly.mockResolvedValue([
      { year: 2022, month: 1, total_felony: 1, total_accident: 0, total_assaults: 45, firearm: 30 },
      { year: 2022, month: 2, total_felony: 2, total_accident: 1, total_assaults: 52, firearm: 35 },
    ]);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'monthly', year: 2022 });
    const result = await fbiGetLeoka.handler(input, ctx);
    expect(result.period).toBe('monthly');
    expect(result.year).toBe(2022);
    expect(result.records).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it('returns year-to-date LEOKA records', async () => {
    mockGetLeokaYtd.mockResolvedValue([
      { year: 2022, total_felony: 48, total_accident: 20, total_assaults: 10200 },
    ]);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'ytd' });
    const result = await fbiGetLeoka.handler(input, ctx);
    expect(result.period).toBe('ytd');
    expect(result.records).toHaveLength(1);
    expect(result.totalRows).toBe(1);
  });

  it('throws no_data when monthly returns empty', async () => {
    mockGetLeokaMonthly.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'monthly', year: 1960 });
    await expect(fbiGetLeoka.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('throws no_data when ytd returns empty', async () => {
    mockGetLeokaYtd.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'ytd', year: 1960 });
    await expect(fbiGetLeoka.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats monthly output with month, felony, and assault columns', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'monthly',
      year: 2022,
      records: [
        {
          year: 2022,
          month: 1,
          total_felony: 1,
          total_accident: 0,
          total_assaults: 45,
          firearm: 30,
        },
      ],
      totalRows: 1,
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Monthly');
    expect(text).toContain('2022');
    expect(text).toContain('1');
    expect(text).toContain('45');
  });

  it('formats ytd output without crashing on sparse row', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'ytd',
      records: [{ year: 2021 }],
      totalRows: 1,
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Year-to-Date');
    expect(text).toContain('2021');
    expect(text).toContain('—');
  });
});
