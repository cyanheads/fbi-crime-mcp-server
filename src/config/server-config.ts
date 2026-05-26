/**
 * @fileoverview Server-specific configuration for fbi-crime-mcp-server.
 * Parses FBI CDE API key, base URLs, and request timeout from environment variables.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  apiKey: z.string().min(1).describe('api.data.gov API key for the FBI Crime Data Explorer API'),
  baseUrlUcr: z
    .string()
    .url()
    .default('https://api.usa.gov/crime/fbi/ucr')
    .describe('Base URL for UCR legacy endpoints'),
  baseUrlCde: z
    .string()
    .url()
    .default('https://api.usa.gov/crime/fbi/cde')
    .describe('Base URL for newer CDE endpoints'),
  requestTimeoutMs: z.coerce
    .number()
    .int()
    .min(1000)
    .default(15_000)
    .describe('Per-request timeout in milliseconds'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'FBI_API_KEY',
    baseUrlUcr: 'FBI_API_BASE_UCR',
    baseUrlCde: 'FBI_API_BASE_CDE',
    requestTimeoutMs: 'FBI_REQUEST_TIMEOUT_MS',
  });
  return _config;
}
