/**
 * @fileoverview Tests for fbi_get_human_trafficking tool.
 * @module tests/tools/get-human-trafficking.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetHumanTrafficking } from '@/mcp-server/tools/definitions/get-human-trafficking.tool.js';

const mockGetHumanTraffickingNational = vi.fn();
const mockGetHumanTraffickingState = vi.fn();
const mockGetHumanTraffickingByAgency = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getHumanTraffickingNational: mockGetHumanTraffickingNational,
    getHumanTraffickingState: mockGetHumanTraffickingState,
    getHumanTraffickingByAgency: mockGetHumanTraffickingByAgency,
  }),
}));

describe('fbiGetHumanTrafficking', () => {
  beforeEach(() => {
    mockGetHumanTraffickingNational.mockReset();
    mockGetHumanTraffickingState.mockReset();
    mockGetHumanTraffickingByAgency.mockReset();
  });

  it('returns national human trafficking records', async () => {
    mockGetHumanTraffickingNational.mockResolvedValue([
      {
        data_year: 2022,
        actual_commercial_sex_acts: 2100,
        actual_involuntary_servitude: 450,
        cleared_commercial_sex_acts: 800,
        cleared_involuntary_servitude: 120,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'national' });
    const result = await fbiGetHumanTrafficking.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.actual_commercial_sex_acts).toBe(2100);
    expect(result.totalRows).toBe(1);
    expect(result.caveat).toBeDefined();
  });

  it('returns state-scoped records', async () => {
    mockGetHumanTraffickingState.mockResolvedValue([
      { data_year: 2022, state_abbr: 'CA', actual_commercial_sex_acts: 350 },
    ]);
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'state', state_abbr: 'CA' });
    const result = await fbiGetHumanTrafficking.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.state_abbr).toBe('CA');
    expect(result.records).toHaveLength(1);
  });

  it('returns agency-scoped records by ORI', async () => {
    mockGetHumanTraffickingByAgency.mockResolvedValue([
      { data_year: 2022, ori: 'CA0010400', agency_name: 'LAPD', actual_commercial_sex_acts: 45 },
    ]);
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'agency', ori: 'CA0010400' });
    const result = await fbiGetHumanTrafficking.handler(input, ctx);
    expect(result.scope).toBe('agency');
    expect(result.ori).toBe('CA0010400');
    expect(result.records).toHaveLength(1);
  });

  it('throws scope_requirements when state scope missing state_abbr', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'state' });
    await expect(fbiGetHumanTrafficking.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_requirements' },
    });
  });

  it('throws scope_requirements when agency scope missing ori', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'agency' });
    await expect(fbiGetHumanTrafficking.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'scope_requirements' },
    });
  });

  it('returns empty records with message when no data', async () => {
    mockGetHumanTraffickingNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'national' });
    const result = await fbiGetHumanTrafficking.handler(input, ctx);
    expect(result.records).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  it('formats output with scope label and record counts', () => {
    const output = fbiGetHumanTrafficking.output.parse({
      scope: 'national',
      records: [
        {
          data_year: 2022,
          actual_commercial_sex_acts: 2100,
          actual_involuntary_servitude: 450,
          cleared_commercial_sex_acts: 800,
          cleared_involuntary_servitude: 120,
        },
      ],
      totalRows: 1,
      caveat: 'Human trafficking reporting is a separate UCR collection track.',
    });
    const blocks = fbiGetHumanTrafficking.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('National');
    expect(text).toContain('2022');
    expect(text).toContain('2,100');
  });

  it('formats sparse record with missing fields without crashing', () => {
    const output = fbiGetHumanTrafficking.output.parse({
      scope: 'state',
      state_abbr: 'TX',
      records: [{ data_year: 2021 }],
      totalRows: 1,
      caveat: 'Human trafficking reporting caveat.',
    });
    const blocks = fbiGetHumanTrafficking.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('2021');
    expect(text).toContain('—');
  });
});
