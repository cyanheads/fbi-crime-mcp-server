<div align="center">
  <h1>@cyanheads/fbi-crime-mcp-server</h1>
  <p><b>Exposes the FBI Crime Data Explorer API — monthly UCR offense rates and counts, hate crime, arrest, and NIBRS breakdowns by national, state, or agency scope, agency ORI search, and LEOKA officer-safety statistics via MCP. STDIO or Streamable HTTP.</b>
  <div>6 Callable Tools • 5 Disabled Tools • 0 Registered Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.3.0-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/fbi-crime-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-2.3.1-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/fbi-crime-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/fbi-crime-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.4.4-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/fbi-crime-mcp-server/releases/latest/download/fbi-crime-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=fbi-crime-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvZmJpLWNyaW1lLW1jcC1zZXJ2ZXIiXSwiZW52Ijp7IkZCSV9BUElfS0VZIjoieW91ci1hcGkta2V5In19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22fbi-crime-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Ffbi-crime-mcp-server%22%5D%2C%22env%22%3A%7B%22FBI_API_KEY%22%3A%22your-api-key%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

<div align="center">

**Public Hosted Server:** [https://fbi-crime.caseyjhand.com/mcp](https://fbi-crime.caseyjhand.com/mcp)

</div>

---

## Overview

US crime statistics from the FBI Crime Data Explorer: monthly offense rates and counts with population and reporting coverage, hate crime, arrest, and NIBRS totals at the national, state, or agency level, agency ORI search by state, and statistics on law enforcement officers killed and assaulted (LEOKA).

### Tools

| Tool | Description |
|:---|:---|
| `fbi_search_agencies` | Find agencies in one state and their ORI codes from the CDE agency directory; filter by name words, county, and agency type; paged |
| `fbi_get_crime_estimates` | Monthly UCR offense rates and counts by national, state, or agency scope, from the CDE summarized endpoint; optional state and national comparison rates |
| `fbi_get_hate_crimes` | Hate crime incidents by bias motivation and category, plus offense, location, offender, and judicial-district breakdowns, 1991 through the current year |
| `fbi_get_arrests` | Arrest counts by offense, arrestee sex and race, and age group, 1985 through the current year |
| `fbi_get_nibrs_breakdown` | NIBRS victim, offender, weapon, and related-offense breakdowns for one offense, 1991 through the current year |
| `fbi_get_leoka` | Officer fatality, weapon, and circumstance data (LEOKA) by month or year-to-date, 2020 through the current year |
| `fbi_get_arson` | [DISABLED] Use `fbi_get_crime_estimates` with `offense="arson"` |
| `fbi_get_agency` | [DISABLED] UCR agency profile backend decommissioned; use `fbi_search_agencies` |
| `fbi_get_human_trafficking` | [DISABLED] UCR human trafficking backend decommissioned |
| `fbi_get_participation` | [DISABLED] UCR and CDE participation backends decommissioned |
| `fbi_list_code_table` | [DISABLED] UCR code table backend decommissioned |

The five unavailable entries above are disabled operator records, not callable tools. Visit [FBI CDE](https://cde.ucr.cjis.gov/) for retired datasets.

## Capability reference

### `fbi_search_agencies` <sub>tool</sub>

- `state_abbr` (required, two letters, case-insensitive) selects the state directory. Optional filters run over the whole state: `name_contains` (every word must appear in the agency name, any order, case-insensitive), `county` (equals any of the agency's counties, case-insensitive), and `agency_type` (`City`, `County`, `Other State Agency`, `Other`, `State Police`, `University or College`, or `Tribal`).
- `limit` (1–200, default 50) and `offset` (default 0) page the matches, sorted by agency name then ORI.
- Returns `state_abbr`, `total` (matches before paging), `offset`, `next_offset` (absent on the last page), and `agencies[]` with `ori`, `agency_name`, `agency_type`, `counties`, `is_nibrs`, and `nibrs_start_date` when CDE lists one.
- A code CDE has no directory for (`AS`, `MP`, or an unrecognized code) returns zero agencies with a notice; an `offset` past the end returns zero agencies with a notice naming the total.

---

### `fbi_get_crime_estimates` <sub>tool</sub>

- `scope`: `national` (no identifiers), `state` (only `state_abbr`, two letters), or `agency` (only `ori`, nine letters/digits; find it with `fbi_search_agencies`). Case is normalized to uppercase.
- `offense`: `violent-crime`, `property-crime`, `robbery`, `burglary`, `larceny`, `motor-vehicle-theft`, `arson`, `aggravated-assault`, `rape`, or `homicide`. Date range runs `from_year`/`from_month` through `to_year`/`to_month` (1985 through the current year; months default to January and December), and the start must not be later than the end. A year after the current UTC year fails with `year_out_of_range`; current-year months past the latest data return null values.
- Returns `entity_name`, rates per 100,000 participating population, actual/clearance counts, and nullable `population`, `participated_population`, and `population_coverage_percent` for each offense month, plus `data_last_updated` and `max_data_date` when the provider supplies them.
- `include_comparisons` (default `false`; state or agency scope only) adds `comparisons`: one entry per comparison entity in CDE's order (an agency's state, then the United States; a state's United States), each `{ entity_name, months[] }` with `year`, `month`, `rate_per_100k`, `clearance_rate_per_100k`, `population`, `participated_population`, and `population_coverage_percent` for exactly the scoped months. CDE sends no counts for comparison entities, and the list is empty when CDE sends none.
- Typed errors: `scope_param_missing`, `scope_param_incompatible` (also `include_comparisons: true` on national scope), `year_out_of_range`, `invalid_date_range`, `no_data` (also returned for a well-formed identifier the provider doesn't know).

---

### `fbi_get_hate_crimes` <sub>tool</sub>

- `scope`, `state_abbr`, `ori`, and the `from_year`/`from_month`/`to_year`/`to_month` window follow the `fbi_get_crime_estimates` contract, with years from 1991 through the current year; counts are summed over the window.
- `bias`: `all` (default) or one of 34 CDE bias codes (`11`–`85`, listed on the field). With a code, incidents count that motivation plus multiple-bias incidents that include it.
- Returns `incident_section` (`bias`, `bias_category`) and `bias_section` (`offense_type`, `location_type`, `offender_race`, `offender_ethnicity`, `judicial_district`) as category-to-count maps with every category CDE sends, zeros and nulls kept. The `bias_section` dimensions are counted on different bases and do not sum to one total or to the incident count. Also `bias_label` and `data_last_updated` when supplied.
- An all-zero result succeeds with a `notice`, since CDE returns zeros both for no reports and for an unrecognized state or ORI.
- Typed errors: `scope_param_missing`, `scope_param_incompatible`, `year_out_of_range`, `invalid_date_range`.

---

### `fbi_get_arrests` <sub>tool</sub>

- Scope, identifiers, and window as `fbi_get_hate_crimes`, with years from 1985 through the current year.
- `offense`: `all` (default) or one of 46 CDE numeric offense codes (for example `30` Robbery, `11` Murder and Nonnegligent Homicide; listed on the field). Word slugs such as `robbery` are rejected. Code `23` (Rape - Not Specified) is excluded because CDE returns only zeros for it.
- Returns `offense_name`, `offense_category`, `offense_breakdown`, `arrestee_sex`, `arrestee_race`, `male_arrests_by_age`, and `female_arrests_by_age` as category-to-count maps, plus `offense_label`, `data_last_updated`, and `max_data_date` when supplied. Each grouping is tallied separately, so their sums differ.
- Same all-zero `notice` and typed errors as `fbi_get_hate_crimes`.

---

### `fbi_get_nibrs_breakdown` <sub>tool</sub>

- Scope, identifiers, and window as `fbi_get_hate_crimes`, with years from 1991 through the current year.
- `offense` (required, case-insensitive): one of 71 CDE NIBRS offense codes (for example `13A` Aggravated Assault, `120` Robbery; listed on the field). There is no `all`, and `23*` (Not Specified) is excluded because CDE returns only nulls for it.
- Returns `victim` (`age`, `sex`, `race`, `location`, `ethnicity`, `relationship`), `offender` (`age`, `sex`, `race`, `ethnicity`), and `offense_details` (`weapons`, `related_offenses`) as category-to-count maps with every category CDE sends, zeros and nulls kept, plus `offense_label`, `data_last_updated`, and `max_data_date` when supplied. Dimensions are tallied separately and do not sum to one total.
- Typed errors: `scope_param_missing`, `scope_param_incompatible`, `year_out_of_range`, `invalid_date_range`, `no_data` (CDE has no value for any category: an unrecognized state or ORI, no NIBRS data for the window, or an offense with no reported incidents in the window; for an agency, `fbi_search_agencies` shows `is_nibrs` and `nibrs_start_date`).

---

### `fbi_get_leoka` <sub>tool</sub>

- `period`: `ytd` (year-to-date; omit `month`) or `monthly` (requires `month`, 1–12); `year` is required (2020 through the current year; a later year fails with `year_out_of_range`)
- `totals` carries `total_officers`, `total_incidents`, `total_officers_dod`, `total_officers_doi`, `total_incidents_dod`, and `total_incidents_doi` from the CDE year-to-date block. It appears for both periods and is not a requested-month total. The upstream does not define `dod`/`doi`; they replace the removed `total_*_felonious` and `total_*_accidental` fields with the same values.
- Category-to-count maps: `weapons`, `officer_activity`, `lighting_conditions`, `body_armor_worn`, `location_of_attack`, `offender_previously_known_to_agency`, `offender_prior_mental_illness`, `offender_prior_relationship`, `officer_circumstances_time_of_attack`, `officer_incident_type`, `officer_type_of_assignment`, `weather_conditions`, `offender_demographic`, `officer_demographic`, `officer_death_by_time_of_day`, and `officer_death_by_month`.
- `deaths_by_region` and optional `deaths_by_year` break out killing types such as `Felonious`/`Accidental`; monthly responses omit the annual series. `deaths_by_year` spans the window CDE returns, which can include years after the requested one, and the current year's entry is year-to-date. Absent sections are omitted, null counts mean unavailable, and zero stays zero.
- `officer_death_by_month` keeps only months CDE covers, so a fill zero never reads as a count: monthly responses hold just the requested month under each year, and current-year YTD responses hold months through the current UTC month. Past-year YTD responses keep the series as returned.
- Typed errors: `month_required` (monthly period without `month`), `month_not_applicable` (YTD with `month`), `year_out_of_range`, `no_data`

---

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

FBI CDE-specific:

- CDE summarized endpoint (`/cde/summarized/`) for national, state, and per-agency offense rates and counts across 10 offense types, with opt-in state and national comparison rates
- CDE agency directory (`/cde/agency/byStateAbbr/`) for ORI discovery by state, name, county, and agency type
- CDE hate-crime (`/cde/hate-crime/`), arrest (`/cde/arrest/`), and NIBRS (`/cde/nibrs/`) totals at national, state, and agency scope; NIBRS covers 71 offense codes
- CDE LEOKA endpoint (`/cde/leoka/`) for officer fatality, weapon, and circumstance data by month or year-to-date
- `DEMO_KEY` works without registration (shared, rate-limited pool); a registered api.data.gov key raises throughput
- Five retired tools retain disabled reasons on the HTTP landing page; MCP clients discover only the six callable tools and no resources

Agent-friendly output:

- Typed error reasons carry recovery hints for scope, date and period corrections, or unavailable data
- Sparse upstream rates, clearances, counts, populations and coverage surface as `null` rather than fabricated zeros
- `data_last_updated` and `max_data_date` echo the CDE's own dates

## Getting started

### Public Hosted Instance

A public instance is available at `https://fbi-crime.caseyjhand.com/mcp` — no installation required. No API key needed; the instance supplies its own. Point any MCP client at it via Streamable HTTP:

```json
{
  "mcpServers": {
    "fbi-crime-mcp-server": {
      "type": "streamable-http",
      "url": "https://fbi-crime.caseyjhand.com/mcp"
    }
  }
}
```

### Self-Hosted / Local

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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP base URL for trace and metric export; does not enable log export. | none |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Explicit OTLP log export endpoint; the Docker image includes the required optional peers. | none |

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
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 6 callable tools and 5 disabled operator entries. |
| `src/mcp-server/resources` | Retired agency/state definitions, not registered. |
| `src/services` | FBI CDE API service with response validation and shared retry/timeout logic. |
| `tests/` | Unit and integration tests mirroring `src/`. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources in the arrays passed to `createApp()` in `src/index.ts`
- Active tools call the CDE API (`/cde/summarized/`, `/cde/agency/byStateAbbr/`, `/cde/hate-crime/`, `/cde/arrest/`, `/cde/nibrs/`, `/cde/leoka/`); retired definitions are wrapped with `disabledTool` and omitted from MCP registration
- Wrap FBI API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
