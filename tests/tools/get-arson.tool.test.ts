/**
 * @fileoverview Tests for fbi_get_arson tool.
 * @module tests/tools/get-arson.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetArson } from '@/mcp-server/tools/definitions/get-arson.tool.js';

const mockGetArsonNational = vi.fn();
const mockGetArsonState = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getArsonNational: mockGetArsonNational,
    getArsonState: mockGetArsonState,
  }),
}));

describe('fbiGetArson', () => {
  beforeEach(() => {
    mockGetArsonNational.mockReset();
    mockGetArsonState.mockReset();
  });

  it('returns national arson records', async () => {
    mockGetArsonNational.mockResolvedValue([
      {
        year: 2022,
        total_actual: 42000,
        total_cleared: 11000,
        inhabited_structures: 14000,
        uninhabited_structures: 8000,
        motor_vehicles: 12000,
        other: 8000,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'national' });
    const result = await fbiGetArson.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.year).toBe(2022);
    expect(result.totalYears).toBe(1);
    expect(result.caveat).toBeDefined();
  });

  it('returns state arson records', async () => {
    mockGetArsonState.mockResolvedValue([
      { year: 2022, total_actual: 3500 },
      { year: 2021, total_actual: 3200 },
    ]);
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'state', state_abbr: 'CA' });
    const result = await fbiGetArson.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.records).toHaveLength(2);
    expect(result.totalYears).toBe(2);
  });

  it('throws state_required when scope is state but state_abbr missing', async () => {
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'state' });
    await expect(fbiGetArson.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'state_required' },
    });
  });

  it('throws no_data when API returns empty results', async () => {
    mockGetArsonNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({
      scope: 'national',
      since_year: 1999,
      until_year: 1999,
    });
    await expect(fbiGetArson.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('formats output with scope label, year, and total_actual', () => {
    const output = fbiGetArson.output.parse({
      scope: 'national',
      records: [
        {
          year: 2022,
          total_actual: 42000,
          total_cleared: 11000,
          inhabited_structures: 14000,
          uninhabited_structures: 8000,
          motor_vehicles: 12000,
        },
      ],
      totalYears: 1,
      caveat: 'Arson is tracked under a separate UCR program.',
    });
    const blocks = fbiGetArson.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('National');
    expect(text).toContain('2022');
    expect(text).toContain('42,000');
  });

  it('formats state arson with state label', () => {
    const output = fbiGetArson.output.parse({
      scope: 'state',
      state_abbr: 'TX',
      records: [{ year: 2022, total_actual: 4500 }],
      totalYears: 1,
      caveat: 'Arson is tracked under a separate UCR program.',
    });
    const blocks = fbiGetArson.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('TX');
    expect(text).toContain('4,500');
  });

  it('formats sparse record without crashing', () => {
    const output = fbiGetArson.output.parse({
      scope: 'national',
      records: [{ year: 2020 }],
      totalYears: 1,
      caveat: 'Caveat.',
    });
    const blocks = fbiGetArson.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2020');
    expect(text).toContain('—');
  });
});
