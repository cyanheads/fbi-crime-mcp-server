/**
 * @fileoverview Tests for fbi_list_code_table tool.
 * @module tests/tools/list-code-table.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fbiListCodeTable } from '@/mcp-server/tools/definitions/list-code-table.tool.js';

const mockGetCodeTable = vi.fn();

vi.mock('@/services/fbi-api/fbi-api-service.js', () => ({
  getFbiApiService: () => ({ getCodeTable: mockGetCodeTable }),
}));

describe('fbiListCodeTable', () => {
  beforeEach(() => {
    mockGetCodeTable.mockReset();
  });

  it('returns offense code entries', async () => {
    mockGetCodeTable.mockResolvedValue([
      { key: 'Burglary/Breaking and Entering', value: 'Burglary/Breaking and Entering' },
      { key: 'Larceny/Theft Offenses', value: 'Larceny/Theft Offenses' },
    ]);
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'offenses' });
    const result = await fbiListCodeTable.handler(input, ctx);
    expect(result.table).toBe('offenses');
    expect(result.entries).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });

  it('returns bias_motivation entries', async () => {
    mockGetCodeTable.mockResolvedValue([
      { key: 'Anti-Black or African American', value: 'Anti-Black or African American' },
      { key: 'Anti-Jewish', value: 'Anti-Jewish' },
      { key: 'Anti-Gay (Male)', value: 'Anti-Gay (Male)' },
    ]);
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'bias_motivation' });
    const result = await fbiListCodeTable.handler(input, ctx);
    expect(result.table).toBe('bias_motivation');
    expect(result.entries).toHaveLength(3);
    expect(result.totalCount).toBe(3);
  });

  it('throws table_empty when API returns no entries', async () => {
    mockGetCodeTable.mockResolvedValue([]);
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'location_type' });
    await expect(fbiListCodeTable.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'table_empty' },
    });
  });

  it('preserves optional code and description fields', async () => {
    mockGetCodeTable.mockResolvedValue([
      {
        key: 'A',
        code: 'A01',
        value: 'Single occupancy residential',
        description: 'Single family home or condo',
      },
    ]);
    const ctx = createMockContext({ errors: fbiListCodeTable.errors });
    const input = fbiListCodeTable.input.parse({ table: 'location_type' });
    const result = await fbiListCodeTable.handler(input, ctx);
    expect(result.entries[0]?.code).toBe('A01');
    expect(result.entries[0]?.description).toBeDefined();
  });

  it('formats output with table name and code entries', () => {
    const output = fbiListCodeTable.output.parse({
      table: 'offenses',
      entries: [
        { key: 'Burglary/Breaking and Entering', value: 'Burglary/Breaking and Entering' },
        { key: 'Larceny/Theft Offenses', value: 'Larceny/Theft Offenses' },
      ],
      totalCount: 2,
    });
    const blocks = fbiListCodeTable.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('offenses');
    expect(text).toContain('Burglary/Breaking and Entering');
    expect(text).toContain('2');
  });

  it('formats entries with code and description suffix', () => {
    const output = fbiListCodeTable.output.parse({
      table: 'location_type',
      entries: [
        {
          key: 'A',
          code: 'A01',
          value: 'Residence/Home',
          description: 'Single occupancy residential',
        },
      ],
      totalCount: 1,
    });
    const blocks = fbiListCodeTable.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('A01');
    expect(text).toContain('Residence/Home');
  });
});
