/**
 * @fileoverview Tests for fbi_get_hate_crimes tool.
 * @module tests/tools/get-hate-crimes.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';

describe('fbiGetHateCrimes', () => {
  it('always throws endpoint_decommissioned for national scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({ scope: 'national', cross_offense: false });
    await expect(fbiGetHateCrimes.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({
      scope: 'state',
      state_abbr: 'NY',
      cross_offense: false,
    });
    await expect(fbiGetHateCrimes.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetHateCrimes.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
