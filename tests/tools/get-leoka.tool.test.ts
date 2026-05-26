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

/** Minimal FbiLeokaChartData with totals present (handler requires incidents_victim_officer_totals_ytd). */
const mockChartData = {
  incidents_victim_officer_totals_ytd: {
    total_officers: 58,
    total_incidents: 56,
    total_officers_dod: 37,
    total_officers_doi: 21,
    total_incidents_dod: 35,
    total_incidents_doi: 21,
  },
  weapons: { Handguns: 25, Rifles: 8 },
  officer_activity: { 'Patrolling (Alone)': 20, 'Ambush (No Warning)': 5 },
  officer_death_by_year: {
    Felonious: { '2022': 61, '2021': 73 },
    Accidental: { '2022': 57, '2021': 53 },
  },
  officer_death_by_geographic_region: { South: 25, West: 15 },
  lighting_conditions: { Daylight: 30, Dark: 20 },
};

describe('fbiGetLeoka', () => {
  beforeEach(() => {
    mockGetLeokaMonthly.mockReset();
    mockGetLeokaYtd.mockReset();
  });

  it('returns ytd LEOKA data', async () => {
    mockGetLeokaYtd.mockResolvedValue(mockChartData);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'ytd', year: 2022 });
    const result = await fbiGetLeoka.handler(input, ctx);
    expect(result.period).toBe('ytd');
    expect(result.year).toBe(2022);
    expect(result.totals.total_officers).toBe(58);
    expect(result.totals.total_officers_felonious).toBe(37);
    expect(result.totals.total_officers_accidental).toBe(21);
    expect(result.totals.total_incidents_felonious).toBe(35);
    expect(result.totals.total_incidents_accidental).toBe(21);
    expect(result.weapons).toEqual({ Handguns: 25, Rifles: 8 });
    expect(result.deaths_by_year).toBeDefined();
    expect(result.deaths_by_region).toBeDefined();
    expect(result.lighting_conditions).toBeDefined();
  });

  it('returns monthly LEOKA data', async () => {
    mockGetLeokaMonthly.mockResolvedValue(mockChartData);
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'monthly', year: 2022, month: 6 });
    const result = await fbiGetLeoka.handler(input, ctx);
    expect(result.period).toBe('monthly');
    expect(result.year).toBe(2022);
    expect(result.month).toBe(6);
  });

  it('throws month_required when period is monthly but month is missing', async () => {
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'monthly', year: 2022 });
    await expect(fbiGetLeoka.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'month_required' },
    });
  });

  it('throws no_data when ytd returns chart data without totals', async () => {
    mockGetLeokaYtd.mockResolvedValue({});
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'ytd', year: 2030 });
    await expect(fbiGetLeoka.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('throws no_data when monthly returns chart data without totals', async () => {
    mockGetLeokaMonthly.mockResolvedValue({ weapons: { Handguns: 3 } });
    const ctx = createMockContext({ errors: fbiGetLeoka.errors });
    const input = fbiGetLeoka.input.parse({ period: 'monthly', year: 2022, month: 1 });
    await expect(fbiGetLeoka.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats ytd output with period, year, and fatality table', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'ytd',
      year: 2022,
      totals: {
        total_officers: 58,
        total_officers_felonious: 37,
        total_officers_accidental: 21,
        total_incidents: 56,
        total_incidents_felonious: 35,
        total_incidents_accidental: 21,
      },
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Year-to-Date');
    expect(text).toContain('ytd');
    expect(text).toContain('2022');
    expect(text).toContain('58');
    expect(text).toContain('37');
    expect(text).toContain('35');
  });

  it('formats monthly output with weapons table', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'monthly',
      year: 2022,
      month: 6,
      totals: { total_officers: 5 },
      weapons: { Handguns: 3, Rifles: 1 },
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Monthly');
    expect(text).toContain('2022-06');
    expect(text).toContain('Handguns');
    expect(text).toContain('3');
  });

  it('formats lighting conditions when present', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'ytd',
      year: 2022,
      totals: { total_officers: 10 },
      lighting_conditions: { Daylight: 6, Dark: 4 },
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Lighting');
    expect(text).toContain('Daylight');
  });

  it('formats sparse output without crashing', () => {
    const output = fbiGetLeoka.output.parse({
      period: 'ytd',
      year: 2021,
      totals: {},
    });
    const blocks = fbiGetLeoka.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2021');
    expect(text).toContain('Year-to-Date');
  });
});
