/**
 * @fileoverview Tests for the shared CDE totals output helpers.
 * @module tests/tools/cde-totals.test
 */

import { describe, expect, it } from 'vitest';
import {
  allCountsNull,
  allCountsZero,
  codeListing,
  countMap,
  countTable,
  escapeMarkdown,
  scopeEcho,
  scopeHeading,
  scopeLine,
  zeroCountsNotice,
} from '@/mcp-server/tools/cde-totals.js';

describe('countTable', () => {
  it('renders every category in order, zeros as 0, nulls as —, thousands grouped', () => {
    expect(countTable('Arrests by sex', { Male: 5154454, Female: 0, Unknown: null })).toEqual([
      '',
      '### Arrests by sex',
      '| Category | Count |',
      '|:---------|------:|',
      '| Male | 5,154,454 |',
      '| Female | 0 |',
      '| Unknown | — |',
    ]);
  });

  it('escapes markdown and table syntax in CDE labels and flattens line breaks', () => {
    const rows = countTable('Bias', { 'Anti-Gay (Male)': 1, 'a|b\n## forged': 2 });
    expect(rows.slice(4)).toEqual(['| Anti-Gay \\(Male\\) | 1 |', '| a\\|b \\#\\# forged | 2 |']);
  });

  it('says so for an empty dimension instead of emitting a header-only table', () => {
    expect(countTable('Judicial district', {})).toEqual([
      '',
      '### Judicial district',
      'CDE returned no categories.',
    ]);
  });
});

describe('escapeMarkdown', () => {
  it('backslash-escapes every markdown metacharacter, the backslash included', () => {
    const metacharacters = '\\`*_{}[]()#+.!|<>';
    expect(escapeMarkdown(metacharacters)).toBe(
      [...metacharacters].map((char) => `\\${char}`).join(''),
    );
    expect(escapeMarkdown('Anti-Sikh')).toBe('Anti-Sikh');
  });

  it('flattens CRLF, CR, and LF line breaks to one space each', () => {
    expect(escapeMarkdown('a\r\nb\rc\nd')).toBe('a b c d');
  });
});

describe('allCountsZero', () => {
  it('is true only when there is at least one count and every count is 0', () => {
    expect(allCountsZero([{ a: 0 }, { b: 0, c: 0 }])).toBe(true);
    expect(allCountsZero([{ a: 0 }, { b: 1 }])).toBe(false);
    expect(allCountsZero([{ a: 0, b: null }])).toBe(false);
    expect(allCountsZero([{ a: null }])).toBe(false);
    expect(allCountsZero([{}, {}])).toBe(false);
    expect(allCountsZero([])).toBe(false);
  });
});

describe('allCountsNull', () => {
  it('is true only when there is at least one count and every count is null', () => {
    expect(allCountsNull([{ a: null }, { b: null, c: null }])).toBe(true);
    expect(allCountsNull([{ a: null }, { b: 0 }])).toBe(false);
    expect(allCountsNull([{ a: null, b: 7 }])).toBe(false);
    expect(allCountsNull([{ a: 0 }])).toBe(false);
    expect(allCountsNull([{}, { a: null }])).toBe(true);
    expect(allCountsNull([{}, {}])).toBe(false);
    expect(allCountsNull([])).toBe(false);
  });
});

describe('zeroCountsNotice', () => {
  it('names the identifier check that fits each scope, and none nationally', () => {
    const agency = zeroCountsNotice('agency');
    expect(agency).toContain('does not recognize the ORI');
    expect(agency).toContain('fbi_search_agencies');
    expect(agency).not.toContain('state_abbr');
    const state = zeroCountsNotice('state');
    expect(state).toContain('does not recognize the state code');
    expect(state).toContain('state_abbr');
    expect(state).not.toContain('fbi_search_agencies');
    const national = zeroCountsNotice('national');
    expect(national).toMatch(/^Every count is zero/);
    expect(national).not.toContain('recognize');
    expect(national).not.toContain('state_abbr');
    expect(national).not.toContain('fbi_search_agencies');
  });
});

describe('scope echo', () => {
  it('carries only the identifier its scope uses', () => {
    const window = { from: '01-2023', to: '12-2023' };
    expect(scopeEcho({ scope: 'national', ...window })).toEqual({ scope: 'national', ...window });
    expect(scopeEcho({ scope: 'state', stateAbbr: 'TX', ...window })).toEqual({
      scope: 'state',
      state_abbr: 'TX',
      ...window,
    });
    expect(scopeEcho({ scope: 'agency', ori: 'TXSPD0000', ...window })).toEqual({
      scope: 'agency',
      ori: 'TXSPD0000',
      ...window,
    });
  });

  it('renders a heading and a scope line per scope', () => {
    expect(scopeHeading({ scope: 'national' })).toBe('National');
    expect(scopeHeading({ scope: 'state', state_abbr: 'TX' })).toBe('TX');
    expect(scopeHeading({ scope: 'agency', ori: 'TXSPD0000' })).toBe('ORI: TXSPD0000');
    expect(scopeLine({ scope: 'national' })).toBe('**Scope:** national');
    expect(scopeLine({ scope: 'state', state_abbr: 'TX' })).toBe(
      '**Scope:** state | **State:** TX',
    );
    expect(scopeLine({ scope: 'agency', ori: 'TXSPD0000' })).toBe(
      '**Scope:** agency | **ORI:** TXSPD0000',
    );
  });
});

describe('codeListing and countMap', () => {
  it('lists every code with its label', () => {
    expect(codeListing({ '11': 'Anti-White', '12': 'Anti-Black' })).toBe(
      '11 Anti-White; 12 Anti-Black',
    );
  });

  it('accepts null and zero counts and rejects non-numeric ones', () => {
    const schema = countMap('Counts.');
    expect(schema.parse({ a: 0, b: null })).toEqual({ a: 0, b: null });
    expect(schema.safeParse({ a: '1' }).success).toBe(false);
    expect(schema.description).toBe('Counts.');
  });
});
