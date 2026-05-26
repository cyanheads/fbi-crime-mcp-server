/**
 * @fileoverview Tests for fbi://state/{state_abbr} resource.
 * @module tests/resources/state.resource.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stateResource } from '@/mcp-server/resources/definitions/state.resource.js';

const mockGetCdeParticipationState = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getCdeParticipationState: mockGetCdeParticipationState }),
}));

describe('stateResource', () => {
  beforeEach(() => {
    mockGetCdeParticipationState.mockReset();
  });

  it('returns state overview for valid state abbreviation', async () => {
    mockGetCdeParticipationState.mockResolvedValue([
      {
        state_abbr: 'CA',
        state_name: 'California',
        year: 2022,
        agency_count: 512,
        months_reported: 11,
        nibrs_participating: 380,
        total_population: 39500000,
        covered_population: 37000000,
      },
    ]);
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = stateResource.params.parse({ state_abbr: 'CA' });
    const result = await stateResource.handler(params, ctx);
    expect(result.state_abbr).toBe('CA');
    expect(result.state_name).toBe('California');
    expect(result.year).toBe(2022);
    expect(result.agency_count).toBe(512);
    expect(result.nibrs_participating).toBe(380);
  });

  it('returns sparse overview when API omits optional fields', async () => {
    mockGetCdeParticipationState.mockResolvedValue([{ state_abbr: 'WY', year: 2022 }]);
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = stateResource.params.parse({ state_abbr: 'WY' });
    const result = await stateResource.handler(params, ctx);
    expect(result.state_abbr).toBe('WY');
    expect(result.agency_count).toBeUndefined();
    expect(result.total_population).toBeUndefined();
  });

  it('throws when state not found (empty API response)', async () => {
    mockGetCdeParticipationState.mockResolvedValue([]);
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = stateResource.params.parse({ state_abbr: 'ZZ' });
    await expect(stateResource.handler(params, ctx)).rejects.toThrow();
  });
});
