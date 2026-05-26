/**
 * @fileoverview Tests for fbi_get_nibrs_breakdown tool.
 * @module tests/tools/get-nibrs-breakdown.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';

const mockGetNibrsBreakdown = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getNibrsBreakdown: mockGetNibrsBreakdown }),
}));

describe('fbiGetNibrsBreakdown', () => {
  beforeEach(() => {
    mockGetNibrsBreakdown.mockReset();
  });

  it('returns national offender breakdown by race_code', async () => {
    mockGetNibrsBreakdown.mockResolvedValue([
      { key: 'White', value: 450000, total: 800000 },
      { key: 'Black or African American', value: 280000, total: 800000 },
    ]);
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'national',
    });
    const result = await fbiGetNibrsBreakdown.handler(input, ctx);
    expect(result.dimension).toBe('offenders');
    expect(result.variable).toBe('race_code');
    expect(result.scope).toBe('national');
    expect(result.breakdown).toHaveLength(2);
    expect(result.totalRows).toBe(2);
    expect(result.caveat).toBeDefined();
  });

  it('returns state-scoped victim breakdown', async () => {
    mockGetNibrsBreakdown.mockResolvedValue([
      { key: 'Male', value: 32000 },
      { key: 'Female', value: 18000 },
    ]);
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'victims',
      variable: 'sex_code',
      scope: 'state',
      state_abbr: 'CA',
    });
    const result = await fbiGetNibrsBreakdown.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.breakdown).toHaveLength(2);
  });

  it('throws state_required when scope is state but state_abbr missing', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'state',
    });
    await expect(fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'state_required' },
    });
  });

  it('throws invalid_variable when variable does not match dimension', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    // weapon_name is valid for offenses but not offenders
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenders',
      variable: 'weapon_name',
      scope: 'national',
    });
    await expect(fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'invalid_variable' },
    });
  });

  it('returns empty breakdown with message and caveat when no data', async () => {
    mockGetNibrsBreakdown.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenses',
      variable: 'weapon_name',
      scope: 'national',
    });
    const result = await fbiGetNibrsBreakdown.handler(input, ctx);
    expect(result.breakdown).toHaveLength(0);
    expect(result.message).toBeDefined();
    expect(result.caveat).toBeDefined();
  });

  it('formats output with dimension, variable, and breakdown rows', () => {
    const output = fbiGetNibrsBreakdown.output.parse({
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'national',
      breakdown: [
        { key: 'White', value: 450000, total: 800000 },
        { key: 'Black or African American', value: 280000, total: 800000 },
      ],
      totalRows: 2,
      caveat: 'NIBRS data only includes incident-level records from NIBRS-reporting agencies.',
    });
    const blocks = fbiGetNibrsBreakdown.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('offenders');
    expect(text).toContain('race_code');
    expect(text).toContain('White');
    expect(text).toContain('NIBRS');
  });

  it('formats sparse breakdown row with missing fields', () => {
    const output = fbiGetNibrsBreakdown.output.parse({
      dimension: 'victims',
      variable: 'age_num',
      scope: 'national',
      breakdown: [{ key: '25-34' }],
      totalRows: 1,
      caveat: 'NIBRS coverage caveat.',
    });
    const blocks = fbiGetNibrsBreakdown.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('25-34');
    expect(text).toContain('—');
  });
});
