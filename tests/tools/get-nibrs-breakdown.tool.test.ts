/**
 * @fileoverview Tests for fbi_get_nibrs_breakdown tool.
 * @module tests/tools/get-nibrs-breakdown.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';

describe('fbiGetNibrsBreakdown', () => {
  it('always throws endpoint_decommissioned for national offenders', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'national',
    });
    await expect(fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state victims', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'victims',
      variable: 'sex_code',
      scope: 'state',
      state_abbr: 'CA',
    });
    await expect(fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetNibrsBreakdown.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
