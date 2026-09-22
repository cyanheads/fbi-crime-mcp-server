<div align="center">
  <h1>@cyanheads/fbi-crime-mcp-server</h1>
  <p><b>Exposes the FBI Crime Data Explorer API — UCR crime estimates, NIBRS incident breakdowns, hate crimes, arrests, human trafficking, and agency participation data via MCP. STDIO or Streamable HTTP.</b>
  <div>12 Tools (3 active via CDE API, 9 decommissioned) • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.8-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/fbi-crime-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-2.0.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/fbi-crime-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/fbi-crime-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.4.0-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/fbi-crime-mcp-server/releases/latest/download/fbi-crime-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=fbi-crime-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvZmJpLWNyaW1lLW1jcC1zZXJ2ZXIiXSwiZW52Ijp7IkZCSV9BUElfS0VZIjoieW91ci1hcGkta2V5In19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22fbi-crime-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Ffbi-crime-mcp-server%22%5D%2C%22env%22%3A%7B%22FBI_API_KEY%22%3A%22your-api-key%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

---

## Overview

FBI Crime Data Explorer (CDE) data — monthly UCR offense rates and counts by national, state, or agency scope, plus Law Enforcement Officers Killed and Assaulted (LEOKA) statistics. Query crime trends and officer-safety data from any MCP client; the CDE's legacy UCR endpoints (agency search, NIBRS breakdowns, hate crimes, arrests, human trafficking, participation) have been decommissioned by the FBI, and their tools and resources return an error. Runs as a stdio process or a local Streamable HTTP server.

### Tools

| Tool | Description |
|:---|:---|
| `fbi_get_crime_estimates` | Monthly UCR offense rates and counts by national, state, or agency scope, from the CDE summarized endpoint |
| `fbi_get_agency_offenses` | Same CDE summarized endpoint, scoped to a single agency, state, or the national level |
| `fbi_get_leoka` | Officer fatality, weapon, and circumstance data (LEOKA) by month or year-to-date |
| `fbi_get_arson` | [UNAVAILABLE] Redirects to `fbi_get_crime_estimates` with `offense="arson"` |
| `fbi_search_agencies` | [UNAVAILABLE] UCR agency search backend decommissioned |
| `fbi_get_agency` | [UNAVAILABLE] UCR agency profile backend decommissioned |
| `fbi_get_arrests` | [UNAVAILABLE] UCR arrests backend decommissioned |
| `fbi_get_hate_crimes` | [UNAVAILABLE] UCR hate crimes backend decommissioned |
| `fbi_get_human_trafficking` | [UNAVAILABLE] UCR human trafficking backend decommissioned |
| `fbi_get_nibrs_breakdown` | [UNAVAILABLE] UCR NIBRS breakdown backend decommissioned |
| `fbi_get_participation` | [UNAVAILABLE] UCR and CDE participation backends decommissioned |
| `fbi_list_code_table` | [UNAVAILABLE] UCR code table backend decommissioned |

### Resources

| Resource | Description |
|:---|:---|
| `fbi://agency/{ori}` | [UNAVAILABLE] Agency profile by ORI; UCR backend decommissioned |
| `fbi://state/{state_abbr}` | [UNAVAILABLE] State participation overview; CDE backend decommissioned |

## Capability reference

### `fbi_get_crime_estimates` <sub>tool</sub>

- `scope`: `national`, `state` (requires `state_abbr`, 2 letters), or `agency` (requires `ori`, 9 characters)
- `offense`: one of `violent-crime`, `property-crime`, `robbery`, `burglary`, `larceny`, `motor-vehicle-theft`, `arson`, `aggravated-assault`, `rape`, `homicide`
- Date range via `from_year`/`from_month` (default January) and `to_year`/`to_month` (default December), years 2000–2030
- Returns per-100k rates and raw actual/clearance counts by month, plus `data_last_updated` when the CDE reports a refresh date
- Typed errors: `scope_param_missing` (missing `state_abbr`/`ori` for the chosen scope), `no_data`

---

### `fbi_get_agency_offenses` <sub>tool</sub>

- Same CDE summarized endpoint as `fbi_get_crime_estimates`, scoped by `scope`: `national`, `state` (`state_abbr`), or `agency` (`ori`)
- Same `offense` enum and `from_year`/`from_month`/`to_year`/`to_month` range (years 2000–2030)
- Typed errors: `scope_param_missing`, `no_data`

---

### `fbi_get_leoka` <sub>tool</sub>

- `period`: `ytd` (year-to-date) or `monthly` (requires `month`, 1–12); `year` is required (2000–2030)
- Returns fatality totals (feloniously/accidentally killed, incident counts), plus weapon, officer-activity, lighting-condition, and geographic-region breakdowns when the CDE reports them
- `deaths_by_year` and `deaths_by_region` are keyed by `Felonious`/`Accidental`
- Typed errors: `month_required` (monthly period without `month`), `no_data`

---

### `fbi_get_arson` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the dedicated UCR arson endpoint is decommissioned
- Recovery hint redirects to `fbi_get_crime_estimates` with `offense="arson"`, which serves arson data via the CDE summarized endpoint
- Input fields (`scope`, `state_abbr`, `since_year`, `until_year`) are accepted but unused

---

### `fbi_search_agencies` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR agency search backend (`crime-data-api.fr.cloud.gov`) is decommissioned
- Recovery hint points to cde.ucr.cjis.gov or the FBI UCR program
- Input fields (`state_abbr`, `agency_type`, `city`, `population_group`, `page`, `per_page`) are accepted but unused

---

### `fbi_get_agency` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR agency profile backend is decommissioned, with no CDE replacement identified
- Recovery hint points to cde.ucr.cjis.gov
- `ori` input is accepted but unused

---

### `fbi_get_arrests` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR arrests backend is decommissioned
- Recovery hint points to cde.ucr.cjis.gov or FBI bulk CSV downloads
- `since_year`/`until_year` inputs are accepted but unused

---

### `fbi_get_hate_crimes` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR hate crimes backend is decommissioned
- Recovery hint points to cde.ucr.cjis.gov
- Input fields (`scope`, `state_abbr`, `since_year`, `until_year`, `cross_offense`) are accepted but unused

---

### `fbi_get_human_trafficking` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR human trafficking backend is decommissioned
- Recovery hint points to cde.ucr.cjis.gov
- Input fields (`scope`, `state_abbr`, `ori`, `since_year`, `until_year`) are accepted but unused

---

### `fbi_get_nibrs_breakdown` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR NIBRS breakdown backend is decommissioned
- Recovery hint points to cde.ucr.cjis.gov
- Input fields (`dimension`, `variable`, `scope`, `state_abbr`, `offense_name`, `since_year`, `until_year`) are accepted but unused

---

### `fbi_get_participation` <sub>tool</sub>

- Always throws `ServiceUnavailable` — both the UCR legacy backend and the CDE `/LATEST/participation/` path are decommissioned (404)
- Recovery hint points to cde.ucr.cjis.gov
- Input fields (`scope`, `state_abbr`, `year`, `nibrs_only`, `page`, `per_page`) are accepted but unused

---

### `fbi_list_code_table` <sub>tool</sub>

- Always throws `ServiceUnavailable` — the UCR code table backend is decommissioned
- Recovery hint points to cde.ucr.cjis.gov
- `table` input (one of 10 code-table names) is accepted but unused

---

### `fbi://agency/{ori}` <sub>resource</sub>

- Always throws `ServiceUnavailable` on read — the UCR agency profile backend is decommissioned
- `ori` is the 9-character ORI (Originating Agency Identifier) code

---

### `fbi://state/{state_abbr}` <sub>resource</sub>

- Always throws `ServiceUnavailable` on read — the CDE `/LATEST/participation/state/` path returns 404
- `state_abbr` is the two-letter US state abbreviation

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

FBI CDE-specific:

- CDE summarized endpoint (`/cde/summarized/`) for national, state, and per-agency offense rates and counts across 10 offense types
- CDE LEOKA endpoint (`/cde/leoka/`) for officer fatality, weapon, and circumstance data by month or year-to-date
- `DEMO_KEY` works without registration (shared, rate-limited pool); a registered api.data.gov key raises throughput
- 9 of 12 tools and both resources return a `ServiceUnavailable` error — the legacy UCR backend (`crime-data-api.fr.cloud.gov`) was decommissioned; `fbi_get_arson` redirects callers to `fbi_get_crime_estimates`

Agent-friendly output:

- Typed error reasons (`scope_param_missing`, `no_data`, `month_required`, `endpoint_decommissioned`) each carry a recovery hint naming the next step or the cde.ucr.cjis.gov replacement
- Sparse upstream fields surface as `null` rather than fabricated zeros, on the rate, clearance, and count fields of `fbi_get_crime_estimates` and `fbi_get_agency_offenses`
- `data_last_updated` echoes the CDE's own refresh timestamp so agents can reason about freshness

## Getting started

Add the following to your MCP client configuration file. See the [FBI CDE API key registration](https://api.data.gov/signup/) to obtain a key — DEMO_KEY works for exploration but is rate-limited.

```json
{
  "mcpServers": {
    "fbi-crime-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@cyanheads/fbi-crime-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "FBI_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or with npx (no Bun required):

```json
{
  "mcpServers": {
    "fbi-crime-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cyanheads/fbi-crime-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "FBI_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or with Docker:

```json
{
  "mcpServers": {
    "fbi-crime-mcp-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT_TYPE=stdio",
        "-e", "FBI_API_KEY=your-api-key",
        "ghcr.io/cyanheads/fbi-crime-mcp-server:latest"
      ]
    }
  }
}
```

For Streamable HTTP, set the transport and start the server:

```sh
MCP_TRANSPORT_TYPE=http MCP_HTTP_PORT=3010 FBI_API_KEY=... bun run start:http
# Server listens at http://localhost:3010/mcp
```

### Prerequisites

- [Bun v1.4.0](https://bun.sh/) or higher (or Node.js v24+).
- An [api.data.gov API key](https://api.data.gov/signup/) for the FBI CDE API. `DEMO_KEY` works for testing but is rate-limited to ~1,000 req/hr from a shared pool.

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/fbi-crime-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd fbi-crime-mcp-server
```

3. **Install dependencies:**

```sh
bun install
```

4. **Configure environment:**

```sh
cp .env.example .env
# edit .env and set FBI_API_KEY
```

## Configuration

All configuration is validated at startup via Zod schemas in `src/config/server-config.ts`. Key environment variables:

| Variable | Description | Default |
|:---------|:------------|:--------|
| `FBI_API_KEY` | **Required.** api.data.gov API key for the FBI CDE API. Use `DEMO_KEY` for limited testing. | — |
| `FBI_API_BASE_UCR` | Override UCR base URL. | `https://api.usa.gov/crime/fbi/ucr` |
| `FBI_API_BASE_CDE` | Override CDE base URL. | `https://api.usa.gov/crime/fbi/cde` |
| `FBI_REQUEST_TIMEOUT_MS` | Per-request timeout in milliseconds. | `15000` |
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | Port for HTTP server. | `3010` |
| `MCP_HTTP_ENDPOINT_PATH` | HTTP endpoint path. | `/mcp` |
| `MCP_SESSION_MODE` | HTTP session mode: `stateless`, `stateful`, or `auto` (resolves to `stateful`). The server declares `stateless` in code; set this to override it. | `stateless` |
| `MCP_PUBLIC_URL` | Public origin override for TLS-terminating reverse-proxy deployments. | none |
| `MCP_AUTH_MODE` | Auth mode: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (RFC 5424). | `info` |
| `MCP_GC_PRESSURE_INTERVAL_MS` | Opt-in Bun-only forced-GC pressure interval (ms). Try `60000` if RSS grows under sustained HTTP load. | `0` |
| `LOGS_DIR` | Directory for log files (Node.js only). | `<project-root>/logs` |
| `STORAGE_PROVIDER_TYPE` | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv/r2/d1`. | `in-memory` |
| `OTEL_ENABLED` | Enable [OpenTelemetry instrumentation](https://github.com/cyanheads/mcp-ts-core/tree/main/docs/telemetry). | `false` |

See [`.env.example`](./.env.example) for the full list of optional overrides.

## Running the server

### Local development

- **Build and run:**

  ```sh
  # One-time build
  bun run rebuild

  # Run the built server
  bun run start:stdio
  # or
  bun run start:http
  ```

- **Run checks and tests:**

  ```sh
  bun run devcheck   # Lint, format, typecheck, security
  bun run test       # Vitest test suite
  bun run lint:mcp   # Validate MCP definitions against spec
  ```

### Docker

```sh
docker build -t fbi-crime-mcp-server .
docker run --rm -e FBI_API_KEY=your-key -p 3010:3010 fbi-crime-mcp-server
```

The Dockerfile defaults to HTTP transport, stateless session mode, and logs to `/var/log/fbi-crime-mcp-server`. OpenTelemetry peer dependencies are installed by default — build with `--build-arg OTEL_ENABLED=false` to omit them.

## Project structure

| Directory | Purpose |
|:----------|:--------|
| `src/index.ts` | `createApp()` entry point — registers tools, resources, and inits services. |
| `src/config` | Server-specific environment variable parsing and validation with Zod. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 12 tools — 3 active via CDE API, 9 decommissioned. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`). Agency and state overview resources. |
| `src/services` | FBI API service layer — UCR and CDE clients with shared retry/timeout logic. |
| `tests/` | Unit and integration tests mirroring `src/`. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources via the barrels in `src/mcp-server/*/definitions/index.ts`
- Active tools call the CDE API (`/cde/summarized/`, `/cde/leoka/`); decommissioned tools throw `serviceUnavailable` with a recovery hint
- Wrap FBI API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
