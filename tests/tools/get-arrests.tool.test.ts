/**
 * @fileoverview Tests for fbi_get_arrests tool.
 * @module tests/tools/get-arrests.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';

describe('fbiGetArrests', () => {
  it('always throws endpoint_decommissioned', async () => {
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({ since_year: 2022, until_year: 2022 });
    await expect(fbiGetArrests.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('throws even without year range parameters', async () => {
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({});
    await expect(fbiGetArrests.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetArrests.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
