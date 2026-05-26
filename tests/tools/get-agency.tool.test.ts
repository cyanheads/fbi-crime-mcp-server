/**
 * @fileoverview Tests for fbi_get_agency tool.
 * @module tests/tools/get-agency.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetAgency } from '@/mcp-server/tools/definitions/get-agency.tool.js';

describe('fbiGetAgency', () => {
  it('always throws endpoint_decommissioned', async () => {
    const ctx = createMockContext({ errors: fbiGetAgency.errors });
    const input = fbiGetAgency.input.parse({ ori: 'CA0010400' });
    await expect(fbiGetAgency.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('throws for any ORI', async () => {
    const ctx = createMockContext({ errors: fbiGetAgency.errors });
    const input = fbiGetAgency.input.parse({ ori: 'TX0010400' });
    await expect(fbiGetAgency.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetAgency.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
