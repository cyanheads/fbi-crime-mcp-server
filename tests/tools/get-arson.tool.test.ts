/**
 * @fileoverview Tests for fbi_get_arson tool.
 * @module tests/tools/get-arson.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetArson } from '@/mcp-server/tools/definitions/get-arson.tool.js';

describe('fbiGetArson', () => {
  it('always throws endpoint_decommissioned for national scope', async () => {
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'national' });
    await expect(fbiGetArson.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'state', state_abbr: 'CA' });
    await expect(fbiGetArson.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns redirect instructions', () => {
    const blocks = fbiGetArson.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('fbi_get_crime_estimates');
    expect(text).toContain('arson');
  });
});
