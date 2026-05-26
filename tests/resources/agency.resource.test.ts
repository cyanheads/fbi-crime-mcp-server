/**
 * @fileoverview Tests for fbi://agency/{ori} resource.
 * @module tests/resources/agency.resource.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agencyResource } from '@/mcp-server/resources/definitions/agency.resource.js';

const mockGetAgency = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getAgency: mockGetAgency }),
}));

describe('agencyResource', () => {
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
      population: 3900000,
      population_group_desc: 'City 250k+',
    });
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'CA0010400' });
    const result = await agencyResource.handler(params, ctx);
    expect(result.ori).toBe('CA0010400');
    expect(result.agency_name).toBe('Los Angeles Police Dept');
    expect(result.state_abbr).toBe('CA');
    expect(result.total_officers).toBe(9800);
    expect(result.nibrs).toBe(true);
  });

  it('returns minimal profile when API returns sparse data', async () => {
    mockGetAgency.mockResolvedValue({
      ori: 'TX0010400',
      agency_name: 'Test Agency',
    });
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'TX0010400' });
    const result = await agencyResource.handler(params, ctx);
    expect(result.ori).toBe('TX0010400');
    expect(result.agency_name).toBe('Test Agency');
    expect(result.total_officers).toBeUndefined();
  });

  it('throws when agency not found (empty object from API)', async () => {
    mockGetAgency.mockResolvedValue({});
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'XX9999999' });
    await expect(agencyResource.handler(params, ctx)).rejects.toThrow();
  });

  it('throws when API returns null/undefined', async () => {
    mockGetAgency.mockResolvedValue(null);
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'XX9999999' });
    await expect(agencyResource.handler(params, ctx)).rejects.toThrow();
  });
});
