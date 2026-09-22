/**
 * @fileoverview Tests for fbi_get_hate_crimes tool.
 * @module tests/tools/get-hate-crimes.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetHateCrimes } from '@/mcp-server/tools/definitions/get-hate-crimes.tool.js';

describe('fbiGetHateCrimes', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiGetHateCrimes.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiGetHateCrimes, { scope: 'national' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.ServiceUnavailable,
        data: { reason: 'endpoint_decommissioned', recovery: { hint } },
      },
    });
    expect((result.content[0] as { text: string }).text).toContain(`Recovery: ${hint}`);
  });

  it('always throws endpoint_decommissioned for national scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({ scope: 'national', cross_offense: false });
    await expect(async () => fbiGetHateCrimes.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHateCrimes.errors });
    const input = fbiGetHateCrimes.input.parse({
      scope: 'state',
      state_abbr: 'NY',
      cross_offense: false,
    });
    await expect(async () => fbiGetHateCrimes.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetHateCrimes.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
