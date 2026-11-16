/**
 * @fileoverview Server-specific configuration for fbi-crime-mcp-server.
 * Parses FBI CDE API key, base URLs, request timeout, and the limit-clamp switch from
 * environment variables.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  apiKey: z.string().min(1).describe('api.data.gov API key for the FBI Crime Data Explorer API'),
  baseUrlCde: z
    .string()
    .url()
    .default('https://api.usa.gov/crime/fbi/cde')
    .describe('Base URL for the CDE endpoints'),
  requestTimeoutMs: z.coerce
    .number()
    .int()
    .min(1000)
    .default(15_000)
    .describe(
      "Timeout for each attempt of a CDE request in milliseconds; the request's attempts and retry waits share one 50-second deadline",
    ),
  clampLimits: z
    .stringbool()
    .default(true)
    .describe(
      'Serve an fbi_search_agencies limit above 200 at 200 with a notice; false advertises maximum 200 and rejects a larger value',
    ),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'FBI_API_KEY',
    baseUrlCde: 'FBI_API_BASE_CDE',
    requestTimeoutMs: 'FBI_REQUEST_TIMEOUT_MS',
    clampLimits: 'FBI_CLAMP_LIMITS',
  });
  return _config;
}
