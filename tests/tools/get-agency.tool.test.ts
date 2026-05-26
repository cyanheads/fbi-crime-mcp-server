/**
 * @fileoverview Tests for fbi_get_agency tool.
 * @module tests/tools/get-agency.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiGetAgency } from '@/mcp-server/tools/definitions/get-agency.tool.js';

const mockGetAgency = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getAgency: mockGetAgency }),
}));

describe('fbiGetAgency', () => {
  beforeEach(() => {
    mockGetAgency.mockReset();
  });

  it('returns agency profile for valid ORI', async () => {
    mockGetAgency.mockResolvedValue({
      ori: 'CA0010400',
      agency_name: 'Los Angeles Police Dept',
      state_abbr: 'CA',
      state_name: 'California',
      city_name: 'Los Angeles',
      nibrs: true,
      nibrs_start_date: '2021-01-01',
      total_officers: 9800,
      total_civilian: 3000,
      male_civilian: 1800,
      female_civilian: 1200,
      population_group_code: '1A',
    });
    const ctx = createMockContext({ errors: fbiGetAgency.errors });
    const input = fbiGetAgency.input.parse({ ori: 'CA0010400' });
    const result = await fbiGetAgency.handler(input, ctx);
    expect(result.ori).toBe('CA0010400');
    expect(result.agency_name).toBe('Los Angeles Police Dept');
    expect(result.total_officers).toBe(9800);
  });

  it('throws agency_not_found when API returns empty object', async () => {
    mockGetAgency.mockResolvedValue({});
    const ctx = createMockContext({ errors: fbiGetAgency.errors });
    const input = fbiGetAgency.input.parse({ ori: 'XX9999999' });
    await expect(fbiGetAgency.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'agency_not_found' },
    });
  });

  it('formats output with state_abbr, population_group_code, and civilian fields', () => {
    const output = fbiGetAgency.output.parse({
      ori: 'CA0010400',
      agency_name: 'LAPD',
      state_abbr: 'CA',
      population_group_code: '1A',
      population_group_desc: 'City 250k+',
      nibrs: true,
      total_officers: 9800,
      total_civilian: 3000,
      male_civilian: 1800,
      female_civilian: 1200,
    });
    const blocks = fbiGetAgency.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('**State:** CA');
    expect(text).toContain('**Population group code:** 1A');
    expect(text).toContain('Male civilian: 1800');
    expect(text).toContain('Female civilian: 1200');
  });

  it('formats sparse agency without crashing', () => {
    const output = fbiGetAgency.output.parse({ ori: 'CA0010400' });
    const blocks = fbiGetAgency.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('CA0010400');
    expect(text).toContain('Not available');
  });
});
