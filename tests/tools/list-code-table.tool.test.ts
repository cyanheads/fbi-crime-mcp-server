/**
 * @fileoverview Tests for fbi_list_code_table tool.
 * @module tests/tools/list-code-table.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { fbiListCodeTable } from '@/mcp-server/tools/definitions/list-code-table.tool.js';

describe('fbiListCodeTable', () => {
  it('returns endpoint_decommissioned with its declared recovery hint on both surfaces', async () => {
    const hint = fbiListCodeTable.errors?.find(
      (e) => e.reason === 'endpoint_decommissioned',
    )?.recovery;
    expect(hint).toBeTypeOf('string');
    const result = await runToolContract(fbiListCodeTable, { table: 'offenses' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.ServiceUnavailable,
        data: { reason: 'endpoint_decommissioned', recovery: { hint } },
      },
    });
    expect((result.content[0] as { text: string }).text).toContain(`Recovery: ${hint}`);
  });

  it('always throws endpoint_decommissioned for offenses table', async () => {
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'offenses' });
    await expect(async () => fbiListCodeTable.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('always throws endpoint_decommissioned for bias_motivation table', async () => {
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'bias_motivation' });
    await expect(async () => fbiListCodeTable.handler(input, ctx)).rejects.toThrow(
      /decommissioned/i,
    );
  });

  it('format returns unavailability message', () => {
    const blocks = fbiListCodeTable.format!({});
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('unavailable');
    expect(text).toContain('decommissioned');
  });
});
