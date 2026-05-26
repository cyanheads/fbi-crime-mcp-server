<div align="center">
  <h1>@cyanheads/fbi-crime-mcp-server</h1>
  <p><b>Exposes the FBI Crime Data Explorer API — crime estimates, agency offense rates, and LEOKA officer safety data via MCP. STDIO or Streamable HTTP.</b>
  <div>12 Tools (4 active via CDE API, 8 decommissioned) • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.3-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/fbi-crime-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.29.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/fbi-crime-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/fbi-crime-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^6.0.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.3.2-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/fbi-crime-mcp-server/releases/latest/download/fbi-crime-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=fbi-crime-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvZmJpLWNyaW1lLW1jcC1zZXJ2ZXIiXSwiZW52Ijp7IkZCSV9BUElfS0VZIjoieW91ci1hcGkta2V5In19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22fbi-crime-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Ffbi-crime-mcp-server%22%5D%2C%22env%22%3A%7B%22FBI_API_KEY%22%3A%22your-api-key%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

---

## Tools

12 tools defined. **4 are active** via the FBI CDE API; **8 are decommissioned** — the legacy UCR backend (`crime-data-api.fr.cloud.gov`) was shut down, and those tools return a `ServiceUnavailable` error on every call with guidance to the FBI CDE website.

### Active tools (CDE API)

| Tool | Description |
|:-----|:------------|
| `fbi_get_crime_estimates` | Monthly offense rates (per 100k) and raw counts from the FBI CDE summarized endpoint. National, state, or agency scope. Covers violent-crime, property-crime, robbery, burglary, larceny, motor-vehicle-theft, arson, aggravated-assault, rape, homicide. |
| `fbi_get_agency_offenses` | Same CDE summarized endpoint, scoped to a single agency by ORI code. Returns month-by-month rates and counts for that agency. |
| `fbi_get_leoka` | Law Enforcement Officers Killed and Assaulted (LEOKA) — fatality and assault counts with circumstance and weapon detail, by month or year-to-date. |
| `fbi_get_arson` | Redirects to `fbi_get_crime_estimates` with `offense="arson"` — arson data is available via the CDE summarized endpoint. |

### Decommissioned tools (always return error)

| Tool | Status |
|:-----|:-------|
| `fbi_search_agencies` | UCR agency search backend decommissioned |
| `fbi_get_agency` | UCR agency lookup backend decommissioned |
| `fbi_get_arrests` | UCR arrests backend decommissioned |
| `fbi_get_hate_crimes` | UCR hate crimes backend decommissioned |
| `fbi_get_participation` | UCR participation backend decommissioned |
| `fbi_get_human_trafficking` | UCR human trafficking backend decommissioned |
| `fbi_get_nibrs_breakdown` | NIBRS backend decommissioned |
| `fbi_list_code_table` | UCR code table backend decommissioned |

For decommissioned data, consult [cde.ucr.cjis.gov](https://cde.ucr.cjis.gov/) or download FBI bulk CSV files.

### `fbi_get_crime_estimates`

Monthly offense rates and raw counts from the FBI CDE summarized endpoint.

- Scope: `national`, `state` (requires `state_abbr`), or `agency` (requires ORI)
- Offense types: `violent-crime`, `property-crime`, `robbery`, `burglary`, `larceny`, `motor-vehicle-theft`, `arson`, `aggravated-assault`, `rape`, `homicide`
- Returns per-100k rates and raw actuals by month for the requested date range

---

### `fbi_get_agency_offenses`

Same CDE summarized endpoint scoped to a single agency, state, or national level.

- Functionally equivalent to `fbi_get_crime_estimates` with `scope="agency"` — useful when the agent's mental model is "offenses for this agency" rather than "crime trends"
- Provide ORI for agency scope; `state_abbr` for state scope

---

### `fbi_get_leoka`

Law Enforcement Officers Killed and Assaulted (LEOKA) data.

- Two period modes: `monthly` (by month) or `ytd` (year-to-date)
- Returns feloniously killed, accidentally killed, and assault counts with circumstance and weapon detail

---

### `fbi_get_arson`

Redirects to `fbi_get_crime_estimates` with `offense="arson"`. The dedicated UCR arson endpoint is decommissioned; arson data remains available via the CDE summarized endpoint.

## Resources

| Type | Name | Description |
|:-----|:-----|:------------|
| Resource | `fbi://agency/{ori}` | Agency profile from the CDE summarized endpoint — offense rates and counts for the agency's ORI. |
| Resource | `fbi://state/{state_abbr}` | State crime overview — offense rates and counts from the CDE summarized endpoint. |

## Features

Built on [`@cyanheads/mcp-ts-core`](https://www.npmjs.com/package/@cyanheads/mcp-ts-core):

- Declarative tool and resource definitions — single file per primitive, framework handles registration and validation
- Unified error handling — handlers throw, framework catches, classifies, and formats
- Pluggable auth: `none`, `jwt`, `oauth`
- Swappable storage backends: `in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`
- Structured logging with optional OpenTelemetry tracing
- STDIO and Streamable HTTP transports

FBI Crime Data Explorer-specific:

- **CDE API** (`/cde/summarized/`, `/cde/leoka/`) — the surviving FBI endpoints post-UCR decommission
- Decommissioned tools return a `ServiceUnavailable` error with a recovery hint pointing to [cde.ucr.cjis.gov](https://cde.ucr.cjis.gov/) — agents can report the gap rather than silently failing
- DEMO_KEY mode for no-config exploration; registered api.data.gov key for production throughput

## Getting started

Add the following to your MCP client configuration file. See the [FBI CDE API key registration](https://api.data.gov/signup/) to obtain a key — DEMO_KEY works for exploration but is rate-limited.

```json
{
  "mcpServers": {
    "fbi-crime": {
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
    "fbi-crime": {
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
    "fbi-crime": {
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

- [Bun v1.3.2](https://bun.sh/) or higher (or Node.js v24+).
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
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 12 tools — 4 active via CDE API, 8 decommissioned. |
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

Issues and pull requests are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
