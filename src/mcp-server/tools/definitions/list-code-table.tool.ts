/**
 * @fileoverview FBI CDE reference code table lookup tool.
 * Returns valid values for enum-like parameters used across FBI tools.
 * @module mcp-server/tools/definitions/list-code-table.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const VALID_TABLES = [
  'offenses',
  'bias_motivation',
  'location_type',
  'weapon_type',
  'population_group',
  'victim_type',
  'prop_desc',
  'resident_status',
  'relationship',
  'circumstance',
] as const;

export const fbiListCodeTable = tool('fbi_list_code_table', {
  title: 'FBI List Code Table',
  description:
    'Look up valid values for enum-like parameters used across other FBI crime tools. Call this before queries that need specific offense names, bias codes, location types, weapon types, or other controlled vocabulary. Valid table values: offenses (NIBRS offense names for offense_name parameter), bias_motivation (hate crime bias codes), location_type (crime location names), weapon_type (weapon names), population_group (agency size classifications), victim_type, prop_desc (property description codes), resident_status, relationship (offender–victim relationships), circumstance (homicide circumstances).',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },

  errors: [
    {
      reason: 'invalid_table',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'The requested table name is not one of the valid FBI code table identifiers.',
      recovery:
        'Use one of the valid table values listed in the tool description: offenses, bias_motivation, location_type, weapon_type, population_group, victim_type, prop_desc, resident_status, relationship, or circumstance.',
    },
    {
      reason: 'table_empty',
      code: JsonRpcErrorCode.NotFound,
      when: 'The requested table returned no entries from the API.',
      recovery: 'Verify the table name spelling and try again, or check the FBI CDE API status.',
    },
  ],

  input: z.object({
    table: z
      .enum(VALID_TABLES)
      .describe(
        'Code table to retrieve. One of: offenses, bias_motivation, location_type, weapon_type, population_group, victim_type, prop_desc, resident_status, relationship, circumstance.',
      ),
  }),

  output: z.object({
    table: z.string().describe('The requested code table name.'),
    entries: z
      .array(
        z
          .object({
            key: z.string().optional().describe('Short key or code value used in API parameters.'),
            value: z.string().optional().describe('Human-readable label for the key.'),
            code: z
              .string()
              .optional()
              .describe('Alternative code field if present in API response.'),
            description: z
              .string()
              .optional()
              .describe('Extended description when provided by the API.'),
            name: z.string().optional().describe('Name field when present in API response.'),
          })
          .describe('A single code table entry with key, value, code, name, and description.'),
      )
      .describe('Entries in the code table with key/value pairs.'),
    totalCount: z.number().describe('Total number of entries returned.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_list_code_table', { table: input.table });
    const svc = getFbiApiService();
    const rows = await svc.getCodeTable(input.table, ctx);

    if (rows.length === 0) {
      throw ctx.fail('table_empty', `Code table "${input.table}" returned no entries.`, {
        ...ctx.recoveryFor('table_empty'),
      });
    }

    ctx.log.info('fbi_list_code_table completed', { table: input.table, count: rows.length });
    return { table: input.table, entries: rows, totalCount: rows.length };
  },

  format: (result) => {
    const lines = [
      `## FBI Code Table: ${result.table}`,
      `**Total entries:** ${result.totalCount}`,
      '',
    ];
    for (const entry of result.entries) {
      const key = entry.key ?? entry.code ?? '';
      const code = entry.code;
      const value = entry.value;
      const name = entry.name;
      const description = entry.description;
      const label = value ?? name ?? description ?? '';
      const codeSuffix = code && code !== key ? ` (code: ${code})` : '';
      const descSuffix = description && description !== label ? ` — ${description}` : '';
      const nameSuffix = name && name !== label ? ` | ${name}` : '';
      if (key || label) {
        lines.push(`- **${key}**${codeSuffix}: ${label}${nameSuffix}${descSuffix}`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
