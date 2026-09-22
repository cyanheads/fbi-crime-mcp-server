/**
 * @fileoverview Tests for fbi_get_human_trafficking tool.
 * @module tests/tools/get-human-trafficking.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetHumanTrafficking } from '@/mcp-server/tools/definitions/get-human-trafficking.tool.js';

describe('fbiGetHumanTrafficking', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiGetHumanTrafficking.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiGetHumanTrafficking, { scope: 'national' });
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
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'national' });
    await expect(async () => fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'state', state_abbr: 'CA' });
    await expect(async () => fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for agency scope', async () => {
    const ctx = createMockContext({ errors: fbiGetHumanTrafficking.errors });
    const input = fbiGetHumanTrafficking.input.parse({ scope: 'agency', ori: 'CA0010400' });
    await expect(async () => fbiGetHumanTrafficking.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetHumanTrafficking.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
