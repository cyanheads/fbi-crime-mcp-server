/**
 * @fileoverview Tests for fbi_get_participation tool.
 * @module tests/tools/get-participation.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetParticipation } from '@/mcp-server/tools/definitions/get-participation.tool.js';

const mockGetCdeParticipationNational = vi.fn();
const mockGetCdeParticipationState = vi.fn();
const mockGetCdeParticipationAgencies = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getCdeParticipationNational: mockGetCdeParticipationNational,
    getCdeParticipationState: mockGetCdeParticipationState,
    getCdeParticipationAgencies: mockGetCdeParticipationAgencies,
  }),
}));

describe('fbiGetParticipation', () => {
  beforeEach(() => {
    mockGetCdeParticipationNational.mockReset();
    mockGetCdeParticipationState.mockReset();
    mockGetCdeParticipationAgencies.mockReset();
  });

  it('returns national participation summary', async () => {
    mockGetCdeParticipationNational.mockResolvedValue([
      {
        year: 2022,
        agency_count: 18000,
        months_reported: 11,
        nibrs_participating: 9500,
        total_population: 330000000,
        covered_population: 290000000,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({ scope: 'national', page: 1, per_page: 50 });
    const result = await fbiGetParticipation.handler(input, ctx);
    expect(result.scope).toBe('national');
    expect(result.year).toBe(2022);
    expect(result.agency_count).toBe(18000);
    expect(result.nibrs_participating).toBe(9500);
  });

  it('returns state participation summary', async () => {
    mockGetCdeParticipationState.mockResolvedValue([
      {
        year: 2022,
        agency_count: 512,
        months_reported: 10,
        nibrs_participating: 380,
        total_population: 40000000,
        covered_population: 38000000,
      },
    ]);
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'state',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    const result = await fbiGetParticipation.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.agency_count).toBe(512);
  });

  it('returns agency-scope list with pagination', async () => {
    mockGetCdeParticipationAgencies.mockResolvedValue({
      results: [
        {
          ori: 'CA0010400',
          agency_name: 'LAPD',
          state_abbr: 'CA',
          months_reported: 12,
          nibrs: true,
        },
        {
          ori: 'CA0020200',
          agency_name: 'SFPD',
          state_abbr: 'CA',
          months_reported: 12,
          nibrs: true,
        },
      ],
      pagination: { count: 512, pages: 11 },
    });
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'agency',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    const result = await fbiGetParticipation.handler(input, ctx);
    expect(result.scope).toBe('agency');
    expect(result.agencies).toHaveLength(2);
    expect(result.totalCount).toBe(512);
  });

  it('throws state_required when scope is state but state_abbr missing', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({ scope: 'state', page: 1, per_page: 50 });
    await expect(fbiGetParticipation.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'state_required' },
    });
  });

  it('throws no_data when national participation returns empty', async () => {
    mockGetCdeParticipationNational.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({ scope: 'national', page: 1, per_page: 50 });
    await expect(fbiGetParticipation.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('returns empty agency list with message when no agencies found', async () => {
    mockGetCdeParticipationAgencies.mockResolvedValue({ results: [], pagination: undefined });
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'agency',
      state_abbr: 'XX',
      page: 1,
      per_page: 50,
    });
    const result = await fbiGetParticipation.handler(input, ctx);
    expect(result.agencies).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  it('formats national summary with agency_count and nibrs_participating', () => {
    const output = fbiGetParticipation.output.parse({
      scope: 'national',
      year: 2022,
      agency_count: 18000,
      months_reported: 11,
      nibrs_participating: 9500,
      total_population: 330000000,
      covered_population: 290000000,
    });
    const blocks = fbiGetParticipation.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('National');
    expect(text).toContain('18,000');
    expect(text).toContain('9,500');
  });

  it('formats agency list with ORI and months reported', () => {
    const output = fbiGetParticipation.output.parse({
      scope: 'agency',
      agencies: [
        {
          ori: 'CA0010400',
          agency_name: 'LAPD',
          state_abbr: 'CA',
          months_reported: 12,
          nibrs: true,
        },
      ],
      totalCount: 512,
    });
    const blocks = fbiGetParticipation.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('CA0010400');
    expect(text).toContain('LAPD');
    expect(text).toContain('12');
  });
});
