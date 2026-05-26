/**
 * @fileoverview Tests for fbi_search_agencies tool.
 * @module tests/tools/search-agencies.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiSearchAgencies } from '@/mcp-server/tools/definitions/search-agencies.tool.js';

const mockSearchAgencies = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ searchAgencies: mockSearchAgencies }),
}));

describe('fbiSearchAgencies', () => {
  beforeEach(() => {
    mockSearchAgencies.mockReset();
  });

  it('returns agencies for valid state query', async () => {
    const agencies = [
      {
        ori: 'CA0010400',
        agency_name: 'Los Angeles Police Dept',
        state_abbr: 'CA',
        population_group_code: '1A',
      },
    ];
    mockSearchAgencies.mockResolvedValue({
      results: agencies,
      pagination: { count: 1, page: 1, pages: 1 },
    });
    const ctx = createMockContext();
    const input = fbiSearchAgencies.input.parse({ state_abbr: 'CA', page: 1, per_page: 25 });
    const result = await fbiSearchAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(1);
    expect(result.agencies[0]?.ori).toBe('CA0010400');
    expect(result.totalCount).toBe(1);
  });

  it('returns empty result with guidance message when no agencies found', async () => {
    mockSearchAgencies.mockResolvedValue({ results: [], pagination: undefined });
    const ctx = createMockContext();
    const input = fbiSearchAgencies.input.parse({ state_abbr: 'ZZ', page: 1, per_page: 25 });
    const result = await fbiSearchAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  it('omits pagination when not returned', async () => {
    mockSearchAgencies.mockResolvedValue({ results: [{ ori: 'NY0010400', agency_name: 'NYPD' }] });
    const ctx = createMockContext();
    const input = fbiSearchAgencies.input.parse({ page: 1, per_page: 25 });
    const result = await fbiSearchAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(1);
    expect(result.totalCount).toBeUndefined();
  });

  it('formats output including state_abbr and population_group_code', () => {
    const output = fbiSearchAgencies.output.parse({
      agencies: [
        {
          ori: 'CA0010400',
          agency_name: 'Los Angeles PD',
          state_abbr: 'CA',
          population_group_code: '1A',
          population_group_desc: 'City, 250,000 and over',
          nibrs: true,
          nibrs_start_date: '2021-01-01',
          population: 3900000,
        },
      ],
    });
    const blocks = fbiSearchAgencies.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('CA0010400');
    expect(text).toContain('**State:** CA');
    expect(text).toContain('**Population group code:** 1A');
  });

  it('formats sparse result without crashing', () => {
    const output = fbiSearchAgencies.output.parse({ agencies: [{ ori: 'TX0010400' }] });
    const blocks = fbiSearchAgencies.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('TX0010400');
  });
});
