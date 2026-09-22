/**
 * @fileoverview Tests for fbi_get_participation tool.
 * @module tests/tools/get-participation.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetParticipation } from '@/mcp-server/tools/definitions/get-participation.tool.js';

describe('fbiGetParticipation', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiGetParticipation.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiGetParticipation, { scope: 'national' });
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
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({ scope: 'national', page: 1, per_page: 50 });
    await expect(async () => fbiGetParticipation.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'state',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    await expect(async () => fbiGetParticipation.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for agency scope', async () => {
    const ctx = createMockContext({ errors: fbiGetParticipation.errors });
    const input = fbiGetParticipation.input.parse({
      scope: 'agency',
      state_abbr: 'CA',
      page: 1,
      per_page: 50,
    });
    await expect(async () => fbiGetParticipation.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetParticipation.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
