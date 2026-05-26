/**
 * @fileoverview Tests for fbi://agency/{ori} resource.
 * @module tests/resources/agency.resource.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { agencyResource } from '@/mcp-server/resources/definitions/agency.resource.js';

describe('agencyResource', () => {
  it('always throws endpoint_decommissioned for any ORI', async () => {
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'CA0010400' });
    await expect(agencyResource.handler(params, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('throws for any ORI including unknown ones', async () => {
    const ctx = createMockContext({ tenantId: 'test-tenant' });
    const params = agencyResource.params.parse({ ori: 'XX9999999' });
    await expect(agencyResource.handler(params, ctx)).rejects.toThrow(/decommissioned/i);
  });
});
