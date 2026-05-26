/**
 * @fileoverview Tests for fbi://state/{state_abbr} resource.
 * @module tests/resources/state.resource.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { stateResource } from '@/mcp-server/resources/definitions/state.resource.js';

describe('stateResource', () => {
  it('always throws endpoint_decommissioned for any state', async () => {
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = stateResource.params.parse({ state_abbr: 'CA' });
    await expect(stateResource.handler(params, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('throws for any state abbreviation including unknown ones', async () => {
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = stateResource.params.parse({ state_abbr: 'ZZ' });
    await expect(stateResource.handler(params, ctx)).rejects.toThrow(/decommissioned/i);
  });
});
