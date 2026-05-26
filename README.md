<div align="center">
  <h1>@cyanheads/fbi-crime-mcp-server</h1>
  <p><b>Exposes the FBI Crime Data Explorer API — UCR crime estimates, NIBRS incident breakdowns, hate crimes, arrests, human trafficking, and agency participation data via MCP. STDIO or Streamable HTTP.</b>
  <div>12 Tools • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.0-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-^6.0.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.3.2-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

---

## Tools

12 tools for working with FBI Crime Data Explorer data, organized across two data layers (UCR Summary and NIBRS) plus specialty reporting tracks:

| Tool | Description |
|:-----|:------------|
| `fbi_search_agencies` | Search law enforcement agencies by state, city, type, or population group. Returns ORI codes — the identifier required for all agency-scoped queries. |
| `fbi_get_agency` | Full profile for a single agency by ORI: location, jurisdiction type, population served, NIBRS adoption year, staffing headcount, and UCR participation history. |
| `fbi_get_crime_estimates` | **UCR Summary.** National or state-level estimated crime counts by year, adjusted by the FBI to account for non-reporting agencies. Covers violent and property crime. |
| `fbi_get_agency_offenses` | **UCR Summary.** Offense counts reported by a specific agency (by ORI) or all agencies within a state or county, broken down by offense type and year. |
| `fbi_get_nibrs_breakdown` | **NIBRS only.** Count incident-level NIBRS records broken down by a demographic or attribute variable — nationally or for a specific state. |
| `fbi_get_arrests` | **UCR Summary. National only.** Annual arrest counts by offense type, disaggregated by age group, sex, and race. |
| `fbi_get_hate_crimes` | Hate crime incident counts broken down by bias motivation at national or state level, with optional cross-tab by offense type. |
| `fbi_get_participation` | UCR and NIBRS reporting participation rates — agency count, months reported, NIBRS vs. SRS adoption, and share of population covered. |
| `fbi_get_human_trafficking` | Human trafficking offense and clearance counts (commercial sex acts, involuntary servitude) at national, state, or agency level. |
| `fbi_get_leoka` | Law Enforcement Officers Killed and Assaulted (LEOKA) — fatality and assault counts with circumstance and weapon detail, by month or year-to-date. |
| `fbi_get_arson` | Arson offense counts at national or state level by year, tracked under a separate UCR reporting track. |
| `fbi_list_code_table` | Look up valid values for enum-like parameters used across other tools: offense names, bias codes, location types, weapon types, population groups, and more. |

### `fbi_search_agencies`

Search for law enforcement agencies and retrieve their ORI codes.

- Filter by state abbreviation, city name, agency type (City, County, Federal, State Police, University or College, Tribal, Other), or population group
- ORI codes are required as inputs for `fbi_get_agency`, `fbi_get_agency_offenses`, and `fbi_get_participation`
- Paginated results for large state inventories

---

### `fbi_get_agency`

Full agency profile by 9-character ORI code.

- Jurisdiction type, location, population served
- NIBRS adoption year and UCR participation history
- Staffing headcount
- Use to confirm an agency's data coverage before querying offense counts

---

### `fbi_get_crime_estimates`

FBI-adjusted national or state-level crime estimates.

- Covers violent crime (murder, rape, robbery, aggravated assault) and property crime (burglary, larceny, motor vehicle theft)
- FBI-estimated figures fill in for non-reporting agencies — not raw reported counts
- Rape is returned as both `rape_legacy` and `rape_revised` due to a 2013 definition change; long-term trend analysis should use one series consistently
- Use for top-level trend comparisons across states or years

---

### `fbi_get_agency_offenses`

Raw offense counts from a specific agency or all agencies in a state or county.

- Provide `ori` for a single-agency view; provide `state_abbr` (+ optional `county_fips`) for a multi-agency view
- Returns reported counts — not FBI-adjusted estimates; figures differ from `fbi_get_crime_estimates`
- FIPS codes for `county_fips` are available via the Census MCP server
- Year range filtering via `since_year` / `until_year`

---

### `fbi_get_nibrs_breakdown`

Demographic and attribute breakdowns of NIBRS incident records.

- `dimension` selects what is being counted: `offenders`, `victims`, or `offenses`
- `variable` selects the grouping: race, sex, age, location type, weapon, offense name, offender–victim relationship, and more (see design for full variable table per dimension)
- Optional `offense_name` filter narrows to a specific crime category
- National or state scope; coverage limited to NIBRS-reporting agencies
- Chain with `fbi_get_participation` to understand geographic gaps before drawing conclusions

---

### `fbi_get_hate_crimes`

Hate crime counts by bias motivation.

- Bias categories: race/ethnicity, religion, sexual orientation, disability, gender
- National or state scope
- `cross_offense=true` additionally shows which offense types bias incidents involve
- Voluntary-report program — participation varies sharply by jurisdiction; always pair with `fbi_get_participation`

---

### `fbi_get_participation`

Reporting participation rates for UCR and NIBRS.

- Returns agency count, months of data reported, NIBRS vs. SRS adoption rates, and share of population covered
- Scope: `national`, `state`, or `agency` (all agencies in a state, optionally filtered to NIBRS-only with `nibrs_only=true`)
- Always call alongside any crime count tool — a count from an agency that reported 3 of 12 months is not comparable to a full-year reporter

---

### `fbi_list_code_table`

Look up valid enum values for other tools.

- Valid tables: `offenses`, `bias_motivation`, `location_type`, `weapon_type`, `population_group`, `victim_type`, `prop_desc`, `resident_status`, `relationship`, `circumstance`
- Call this before queries that need specific codes or category names to avoid invalid-input errors

---

### `fbi_get_leoka`

Law Enforcement Officers Killed and Assaulted data.

- Two period modes: `monthly` (by month) or `ytd` (year-to-date)
- Includes feloniously killed, accidentally killed, and assault counts with circumstance and weapon detail
- Use for officer safety trend analysis or as denominator context alongside staffing data from `fbi_get_agency`

## Resources

| Type | Name | Description |
|:-----|:-----|:------------|
| Resource | `fbi://agency/{ori}` | Full agency profile for a given ORI — jurisdiction, type, population, NIBRS adoption year, staffing, reporting history. |
| Resource | `fbi://state/{state_abbr}` | State crime overview — participation rates, UCR vs. NIBRS adoption, total reporting agencies, and population covered. |

All resource data is also reachable via tools. Use `fbi_get_agency` or `fbi_get_participation` for programmatic access in tool-only MCP clients.

## Features

Built on [`@cyanheads/mcp-ts-core`](https://www.npmjs.com/package/@cyanheads/mcp-ts-core):

- Declarative tool and resource definitions — single file per primitive, framework handles registration and validation
- Unified error handling — handlers throw, framework catches, classifies, and formats
- Pluggable auth: `none`, `jwt`, `oauth`
- Swappable storage backends: `in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`
- Structured logging with optional OpenTelemetry tracing
- STDIO and Streamable HTTP transports

FBI Crime Data Explorer-specific:

- Complete FBI CDE/UCR API integration across both base URLs (`/ucr` legacy and `/cde` LATEST endpoints)
- UCR Summary vs. NIBRS data layer labeled explicitly in every tool description — agents route to the right data source without reading parameter docs
- `fbi_get_participation` as a dedicated reliability context tool — paired with count tools so agents surface coverage caveats rather than treating all counts as equivalent
- DEMO_KEY mode for no-config exploration; registered api.data.gov key for production throughput
- Arson separated from property crime totals, rape legacy/revised split documented — methodology breaks are surfaced, not silently merged

Agent-friendly output:

- Data layer transparency — every tool description opens with a bracketed label (`UCR Summary`, `NIBRS only`, specialty track) so routing decisions are made without parameter inspection
- Participation-aware design — `months_reported` and `participating_population_pct` surfaced in relevant responses; `fbi_get_participation` is always the reliability companion
- Structured unavailable reasons and per-scope dispatch — agents can branch on typed scope values (`national`, `state`, `agency`) and receive consistent output shapes rather than parsing text
- Cross-tool workflow patterns — ORI as the shared key across agency, offense, and participation tools; FIPS codes from the Census MCP server for county filtering

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
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 12 tools across UCR, NIBRS, and specialty tracks. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`). Agency and state overview resources. |
| `src/services` | FBI API service layer — UCR and CDE clients with shared retry/timeout logic. |
| `tests/` | Unit and integration tests mirroring `src/`. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources via the barrels in `src/mcp-server/*/definitions/index.ts`
- Wrap FBI API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields
- Data layer labeling: include `UCR Summary`, `NIBRS only`, or specialty track context in every tool description so agents route correctly

## Contributing

Issues and pull requests are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
