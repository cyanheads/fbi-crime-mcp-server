/**
 * @fileoverview Bundle pruning preserves SDK skill runtime while dropping package-root agent docs.
 * @module tests/scripts/agent-doc-entries
 */
import { describe, expect, it } from 'vitest';
import { AGENT_DOC_ENTRY as cleaner } from '../../scripts/clean-mcpb.js';
import { AGENT_DOC_ENTRY as linter } from '../../scripts/lint-packaging.js';

describe.each([
  ['cleaner', cleaner],
  ['linter', linter],
] as const)('%s agent documentation selector', (_, selector) => {
  it.each([
    'node_modules/example/skills/query/SKILL.md',
    'node_modules/@cyanheads/mcp-ts-core/framework-skills/add-tool/SKILL.md',
    'node_modules/example/.claude/skills/foo/SKILL.md',
    'node_modules/example/.agents/skills/foo/SKILL.md',
    'node_modules/example/SKILL.md',
    'node_modules/example/node_modules/@scope/nested/skills/query/SKILL.md',
  ])('strips package-root documentation: %s', (entry) => {
    expect(selector.test(entry)).toBe(true);
  });

  it.each([
    'node_modules/@modelcontextprotocol/server/dist/ext/skills/index.js',
    'node_modules/@modelcontextprotocol/server/dist/ext/skills/loaders/node.js',
    'node_modules/example/dist/skills/runtime.js',
    'skills/query/SKILL.md',
  ])('preserves runtime and published skills: %s', (entry) => {
    expect(selector.test(entry)).toBe(false);
  });
});
