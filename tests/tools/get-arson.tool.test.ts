/**
 * @fileoverview Tests for fbi_get_arson tool.
 * @module tests/tools/get-arson.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiGetArson } from '@/mcp-server/tools/definitions/get-arson.tool.js';

describe('fbiGetArson', () => {
  it('returns endpoint_decommissioned with the fbi_get_crime_estimates redirect hint', async () => {
    const hint = fbiGetArson.errors?.find((e) => e.reason === 'endpoint_decommissioned')?.recovery;
    expect(hint).toContain('fbi_get_crime_estimates');
    const result = await runToolContract(fbiGetArson, { scope: 'national' });
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
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'national' });
    await expect(async () => fbiGetArson.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('always throws endpoint_decommissioned for state scope', async () => {
    const ctx = createMockContext({ errors: fbiGetArson.errors });
    const input = fbiGetArson.input.parse({ scope: 'state', state_abbr: 'CA' });
    await expect(async () => fbiGetArson.handler(input, ctx)).rejects.toThrow(/decommissioned/i);
  });

  it('format returns redirect instructions', () => {
    const blocks = fbiGetArson.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('fbi_get_crime_estimates');
    expect(text).toContain('arson');
  });
});
