/**
 * @fileoverview Tests for fbi_get_arrests tool.
 * @module tests/tools/get-arrests.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetArrests } from '@/mcp-server/tools/definitions/get-arrests.tool.js';

describe('fbiGetArrests', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiGetArrests.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiGetArrests, {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.ServiceUnavailable,
        data: { reason: 'endpoint_decommissioned', recovery: { hint } },
      },
    });
    expect((result.content[0] as { text: string }).text).toContain(`Recovery: ${hint}`);
  });

  it('always throws endpoint_decommissioned', async () => {
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({ since_year: 2022, until_year: 2022 });
    await expect(async () => fbiGetArrests.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('throws even without year range parameters', async () => {
    const ctx = createMockContext({ errors: fbiGetArrests.errors });
    const input = fbiGetArrests.input.parse({});
    await expect(async () => fbiGetArrests.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns unavailability message', () => {
    const blocks = fbiGetArrests.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
