/**
 * @fileoverview Tests for fbi_get_nibrs_breakdown tool.
 * @module tests/tools/get-nibrs-breakdown.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetNibrsBreakdown } from '@/mcp-server/tools/definitions/get-nibrs-breakdown.tool.js';

describe('fbiGetNibrsBreakdown', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiGetNibrsBreakdown.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiGetNibrsBreakdown, {
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'national',
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.ServiceUnavailable,
        data: { reason: 'endpoint_decommissioned', recovery: { hint } },
      },
    });
    expect((result.content[0] as { text: string }).text).toContain(`Recovery: ${hint}`);
  });

  it('always throws endpoint_decommissioned for national offenders', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'offenders',
      variable: 'race_code',
      scope: 'national',
    });
    await expect(async () => fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for state victims', async () => {
    const ctx = createMockContext({ errors: fbiGetNibrsBreakdown.errors });
    const input = fbiGetNibrsBreakdown.input.parse({
      dimension: 'victims',
      variable: 'sex_code',
      scope: 'state',
      state_abbr: 'CA',
    });
    await expect(async () => fbiGetNibrsBreakdown.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetNibrsBreakdown.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
