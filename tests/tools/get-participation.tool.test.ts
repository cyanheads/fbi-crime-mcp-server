/**
 * @fileoverview Tests for fbi_get_participation tool.
 * @module tests/tools/get-participation.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetParticipation } from '@/mcp-server/tools/definitions/get-participation.tool.js';

describe('fbiGetParticipation', () => {
  it('always throws endpoint_decommissioned for national scope', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({ scope: 'national', page: 1, per_page: 50 });
    await expect(fbiGetParticipation.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'state',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    await expect(fbiGetParticipation.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for agency scope', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'agency',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    await expect(fbiGetParticipation.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetParticipation.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
