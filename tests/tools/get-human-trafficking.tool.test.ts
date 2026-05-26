/**
 * @fileoverview Tests for fbi_get_human_trafficking tool.
 * @module tests/tools/get-human-trafficking.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetHumanTrafficking } from '@/mcp-server/tools/definitions/get-human-trafficking.tool.js';

describe('fbiGetHumanTrafficking', () => {
  it('always throws endpoint_decommissioned for national scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'national' });
    await expect(fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'state', state_abbr: 'CA' });
    await expect(fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for agency scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'agency', ori: 'CA0010400' });
    await expect(fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetHumanTrafficking.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
