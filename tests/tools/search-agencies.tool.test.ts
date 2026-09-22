/**
 * @fileoverview Tests for fbi_search_agencies tool.
 * @module tests/tools/search-agencies.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiSearchAgencies } from '@/mcp-server/tools/definitions/search-agencies.tool.js';

describe('fbiSearchAgencies', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiSearchAgencies.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiSearchAgencies, {});
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
    const ctx = createMockContext({ errors: fbiSearchAgencies.errors });
    const input = fbiSearchAgencies.input.parse({ state_abbr: 'CA', page: 1, per_page: 25 });
    await expect(async () => fbiSearchAgencies.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('throws without any filter parameters', async () => {
    const ctx = createMockContext({ errors: fbiSearchAgencies.errors });
    const input = fbiSearchAgencies.input.parse({ page: 1, per_page: 25 });
    await expect(async () => fbiSearchAgencies.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiSearchAgencies.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
