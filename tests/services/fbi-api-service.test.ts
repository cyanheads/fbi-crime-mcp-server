/**
 * @fileoverview Tests for FbiApiService upstream error handling — classification and retry.
 * @module tests/services/fbi-api-service.test
 */

import { parseConfig } from '@cyanheads/mcp-ts-core/config';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createInMemoryStorage, createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FbiApiService } from '@/services/fbi-api/fbi-api-service.js';

const serverConfig = {
  apiKey: 'TEST_KEY',
  baseUrlUcr: 'https://api.usa.gov/crime/fbi/ucr',
  baseUrlCde: 'https://api.usa.gov/crime/fbi/cde',
  requestTimeoutMs: 15_000,
};

describe('FbiApiService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('classifies an upstream 500 as ServiceUnavailable and retries it', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response('upstream failure', { status: 500, statusText: 'Internal Server Error' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const svc = new FbiApiService(parseConfig(), createInMemoryStorage(), serverConfig);

    const outcome = svc.getLeokaYtd({ year: 2022 }, createMockContext()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await outcome).toMatchObject({
      code: JsonRpcErrorCode.ServiceUnavailable,
      data: { retryAttempts: 4 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
