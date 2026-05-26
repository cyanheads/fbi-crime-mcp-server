/**
 * @fileoverview Tests for fbi_get_agency_offenses tool.
 * @module tests/tools/get-agency-offenses.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetAgencyOffenses } from '@/mcp-server/tools/definitions/get-agency-offenses.tool.js';

const mockGetAgencyOffensesByOri = vi.fn();
const mockGetAgencyOffensesByState = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({
    getAgencyOffensesByOri: mockGetAgencyOffensesByOri,
    getAgencyOffensesByState: mockGetAgencyOffensesByState,
  }),
}));

describe('fbiGetAgencyOffenses', () => {
  beforeEach(() => {
    mockGetAgencyOffensesByOri.mockReset();
    mockGetAgencyOffensesByState.mockReset();
  });

  it('returns offense rows for ORI scope', async () => {
    mockGetAgencyOffensesByOri.mockResolvedValue([
      { year: 2022, offense: 'Burglary', actual: 512, cleared: 88 },
      { year: 2022, offense: 'Robbery', actual: 234, cleared: 45 },
    ]);
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({
      ori: 'CA0010400',
      page: 1,
      per_page: 25,
    });
    const result = await fbiGetAgencyOffenses.handler(input, ctx);
    expect(result.scope).toBe('agency');
    expect(result.ori).toBe('CA0010400');
    expect(result.offenses).toHaveLength(2);
  });

  it('throws missing_scope when neither ori nor state_abbr provided', async () => {
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({ page: 1, per_page: 25 });
    await expect(fbiGetAgencyOffenses.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'missing_scope' },
    });
  });

  it('throws no_data when ORI returns empty results', async () => {
    mockGetAgencyOffensesByOri.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({ ori: 'XX9999999', page: 1, per_page: 25 });
    await expect(fbiGetAgencyOffenses.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('returns state-scope results with pagination', async () => {
    mockGetAgencyOffensesByState.mockResolvedValue({
      results: [
        { ori: 'CA0010400', agency_name: 'LAPD', year: 2022, offense: 'Theft', actual: 1000 },
      ],
      pagination: { count: 500, pages: 20 },
    });
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({ state_abbr: 'CA', page: 1, per_page: 25 });
    const result = await fbiGetAgencyOffenses.handler(input, ctx);
    expect(result.scope).toBe('state');
    expect(result.totalCount).toBe(500);
  });

  it('returns empty state result with message', async () => {
    mockGetAgencyOffensesByState.mockResolvedValue({ results: [], pagination: undefined });
    const ctx = createMockContext({ errors: fbiGetAgencyOffenses.errors });
    const input = fbiGetAgencyOffenses.input.parse({ state_abbr: 'XX', page: 1, per_page: 25 });
    const result = await fbiGetAgencyOffenses.handler(input, ctx);
    expect(result.offenses).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  it('formats output including scope and ori', () => {
    const output = fbiGetAgencyOffenses.output.parse({
      scope: 'agency',
      ori: 'CA0010400',
      offenses: [{ year: 2022, offense: 'Burglary', actual: 512, cleared: 88 }],
    });
    const blocks = fbiGetAgencyOffenses.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**Scope:** agency');
    expect(text).toContain('**ORI:** CA0010400');
    expect(text).toContain('Burglary');
  });

  it('formats state scope with state_abbr', () => {
    const output = fbiGetAgencyOffenses.output.parse({
      scope: 'state',
      state_abbr: 'CA',
      offenses: [{ ori: 'CA0010400', agency_name: 'LAPD', year: 2022, offense: 'Theft' }],
    });
    const blocks = fbiGetAgencyOffenses.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('State: CA');
    expect(text).toContain('LAPD');
  });
});
