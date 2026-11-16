/**
 * @fileoverview Tests for the FBI_CLAMP_LIMITS switch in the server config.
 * @module tests/config/server-config.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

/** Parse the server config from a fresh module, so each case reads the variables it stubs. */
async function serverConfigWith(clampLimits: string | undefined) {
  vi.stubEnv('FBI_API_KEY', 'TEST_KEY');
  vi.stubEnv('FBI_CLAMP_LIMITS', clampLimits);
  vi.resetModules();
  const { getServerConfig } = await import('@/config/server-config.js');
  return getServerConfig;
}

describe('FBI_CLAMP_LIMITS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('clamps when unset or blank, and reads the env boolean forms', async () => {
    for (const [value, clampLimits] of [
      [undefined, true],
      ['', true],
      ['true', true],
      ['false', false],
      ['0', false],
      ['off', false],
    ] as const) {
      const getServerConfig = await serverConfigWith(value);
      expect(getServerConfig().clampLimits, String(value)).toBe(clampLimits);
    }
  });

  it('fails with a configuration error naming the variable for any other value', async () => {
    const getServerConfig = await serverConfigWith('maybe');
    expect(getServerConfig).toThrow(/FBI_CLAMP_LIMITS/);
  });
});
