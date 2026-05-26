# fbi-crime-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `fbi_search_agencies` | Search law enforcement agencies by state, city, type, or population group. Returns ORI codes — the identifier required for all agency-scoped queries. Use before `fbi_get_agency_offenses` or `fbi_get_participation` when you have a city/county name but not an ORI. | `state_abbr`, `agency_type` (City/County/Federal/State Police/University or College/Tribal/Other), `city`, `population_group`, `page` | `readOnlyHint` |
| `fbi_get_agency` | Full profile for a single agency by ORI: location, jurisdiction type, population served, NIBRS adoption year, staffing headcount, and UCR participation history. Use to confirm an agency's data coverage before querying offense counts. | `ori` (9-character ORI code) | `readOnlyHint` |
| `fbi_get_crime_estimates` | **UCR Summary.** National or state-level estimated crime counts by year, adjusted by the FBI to account for non-reporting agencies. Covers violent (murder, rape, robbery, aggravated assault) and property (burglary, larceny, motor vehicle theft) crime. Use for top-level trend comparisons across states or years — these are the headline figures the FBI publishes annually. Note: rape is returned as both `rape_legacy` and `rape_revised` due to a 2013 definition change. | `scope` (`national` or `state`), `state_abbr` (required if scope=state), `since_year`, `until_year` | `readOnlyHint` |
| `fbi_get_agency_offenses` | **UCR Summary.** Offense counts reported by a specific agency (by ORI) or all agencies within a state or county, broken down by offense type and year. Returns raw reported counts — not FBI estimates. Use for "what crimes were reported in city X?" or "compare offense counts across agencies in a county." Provide `ori` for a single agency; provide `state_abbr` (+ optional `county_fips`) for multi-agency results. FIPS codes for US counties are available via the Census MCP server. | `ori` (single agency) OR `state_abbr` + optional `county_fips`, `since_year`, `until_year` | `readOnlyHint` |
| `fbi_get_nibrs_breakdown` | **NIBRS only.** Count incident-level NIBRS records broken down by a demographic or attribute variable — nationally or for a specific state. `dimension` selects what is being counted (offenders, victims, or offenses). `variable` selects the grouping (race, sex, age, location type, weapon, offense name, etc.). Optionally filter to a single offense category. Coverage is limited to NIBRS-reporting agencies; check `fbi_get_participation` to understand geographic gaps before drawing conclusions. | `dimension` (`offenders`, `victims`, or `offenses`), `variable` (see variable table below), `scope` (`national` or `state`), `state_abbr`, `offense_name`, `since_year`, `until_year` | `readOnlyHint` |
| `fbi_get_arrests` | **UCR Summary. National only.** Annual arrest counts by offense type, disaggregated by age group, sex, and race. Covers UCR Part I (violent and property) and Part II offenses. State-level arrest data is not available via this API. | `since_year`, `until_year` | `readOnlyHint` |
| `fbi_get_hate_crimes` | Hate crime incident counts broken down by bias motivation (race/ethnicity, religion, sexual orientation, disability, gender) at national or state level. Use `cross_offense=true` to additionally show which offense types bias incidents involve. This data is voluntary-report only — participation varies sharply by jurisdiction; always check `fbi_get_participation` for context. | `scope` (`national` or `state`), `state_abbr`, `since_year`, `until_year`, `cross_offense` | `readOnlyHint` |
| `fbi_get_participation` | UCR and NIBRS reporting participation rates. Returns how many agencies submitted data, months of data reported, NIBRS vs. SRS adoption rates, and share of population covered. **Always call this alongside any crime count to establish data reliability** — a count from an agency that reported 3 of 12 months is not comparable to a full-year reporter. Scope: national, state-level summary, or agency-level list (all agencies in a state, or filtered to NIBRS-only). | `scope` (`national`, `state`, or `agency`), `state_abbr`, `year`, `nibrs_only` (boolean, agency scope only) | `readOnlyHint` |
| `fbi_get_human_trafficking` | Human trafficking offense and clearance counts (commercial sex acts, involuntary servitude) at national, state, or agency level. Reported under a separate UCR collection track; coverage is sparser than main UCR series. | `scope` (`national`, `state`, or `agency`), `state_abbr`, `ori`, `since_year`, `until_year` | `readOnlyHint` |
| `fbi_get_leoka` | Law Enforcement Officers Killed and Assaulted (LEOKA). Returns counts of officer fatalities (feloniously killed, accidentally killed) and assaults with circumstance and weapon detail, by month or year-to-date. Use for officer safety trend analysis or to provide denominator context alongside staffing data from `fbi_get_agency`. | `period` (`monthly` or `ytd`), `year` | `readOnlyHint` |
| `fbi_get_arson` | Arson offense counts at national or state level by year. Arson is tracked under a separate UCR reporting track with lower participation than the main crime series — do not combine with `fbi_get_crime_estimates` property crime totals without noting the separate methodology. | `scope` (`national` or `state`), `state_abbr`, `since_year`, `until_year` | `readOnlyHint` |
| `fbi_list_code_table` | Look up valid values for enum-like parameters used across other tools. Call this before queries that need specific codes or names. Valid `table` values: `offenses` (NIBRS offense names for `offense_name`), `bias_motivation` (hate crime bias codes), `location_type` (crime location names), `weapon_type` (weapon names), `population_group` (agency size classifications), `victim_type`, `prop_desc` (property description codes), `resident_status`, `relationship` (offender–victim relationships), `circumstance` (homicide circumstances). | `table` (one of the values listed above) | `readOnlyHint` |

### Resources

| URI Template | Description |
|:-------------|:------------|
| `fbi://agency/{ori}` | Full agency profile for a given ORI — jurisdiction, type, population, NIBRS adoption year, staffing, reporting history. Useful for attaching static agency context to a multi-step workflow without re-fetching. |
| `fbi://state/{state_abbr}` | State crime overview — current-year participation rates, UCR vs. NIBRS adoption, total reporting agencies, and population covered. Provides fast "is this state's data trustworthy?" context for downstream tools. |

### Prompts

None — this is a data-oriented server.

---

## Overview

`fbi-crime-mcp-server` exposes the FBI Crime Data Explorer (CDE) API to LLMs. It covers the Uniform Crime Reporting (UCR) program: national crime estimates, agency offense counts, hate crimes, NIBRS incident breakdowns, arrest data, human trafficking, arson, law enforcement officer casualties, and reporting participation status.

### UCR Summary vs NIBRS

Every tool touches one of two data layers:

| Layer | What it is | Coverage | Tools |
|:------|:-----------|:---------|:------|
| **UCR Summary (SRS)** | Agency-level annual crime counts by offense type. Legacy format, 1960–present. High coverage (~90%+ agencies). Coarse — totals only, no incident detail. | Broad | `fbi_get_crime_estimates`, `fbi_get_agency_offenses`, `fbi_get_arrests`, `fbi_get_arson` |
| **NIBRS** | Incident-based records with offense, victim, offender, property, and location detail. Far richer, but adoption is still growing — ~60% of agencies as of 2024, with significant state-level variation. | Partial | `fbi_get_nibrs_breakdown` |
| **Specialty tracks** | Separate UCR sub-programs with their own participation rates | Variable | `fbi_get_hate_crimes`, `fbi_get_human_trafficking`, `fbi_get_leoka`, `fbi_get_arson` |

Tool descriptions label their data layer explicitly. Agents should treat NIBRS results as representing a subset of the population unless `fbi_get_participation` confirms broad coverage.

Target users: researchers, journalists, policy analysts, and developers building tools that reason about public safety trends, compare jurisdictions, or connect crime data to other social indicators (Census demographics, labor markets, health outcomes).

---

## Requirements

- FBI CDE API key (free, via api.data.gov registration)
- Base URL: `https://api.usa.gov/crime/fbi/ucr` (UCR legacy endpoints) and `https://api.usa.gov/crime/fbi/cde` (newer CDE endpoints)
- Rate limits: registered api.data.gov key recommended for hosted deployment; DEMO_KEY is 1,000 req/hour from a shared pool
- All endpoints are read-only GET requests
- Data coverage: 1960–present (UCR summary); NIBRS varies by agency adoption year
- Participation caveats must accompany crime counts — tools surface `months_reported` and `participating_population_pct` in relevant responses

---

## Services

| Service | Base URL | Used By |
|:--------|:---------|:--------|
| `UcrApiService` | `https://api.usa.gov/crime/fbi/ucr` | All UCR summary, NIBRS breakdown, agency, hate crime, arrests, arson, human trafficking, participation (legacy), code tables |
| `CdeApiService` | `https://api.usa.gov/crime/fbi/cde` | `fbi_get_participation` (LATEST participation endpoints), `fbi_get_leoka` |

Both services share the same API key, retry logic, and timeout config. May be unified into a single `FbiApiService` with URL routing — defer to implementation.

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `FBI_API_KEY` | Yes | api.data.gov API key for the FBI CDE API |
| `FBI_API_BASE_UCR` | No | Override UCR base URL (default: `https://api.usa.gov/crime/fbi/ucr`) |
| `FBI_API_BASE_CDE` | No | Override CDE base URL (default: `https://api.usa.gov/crime/fbi/cde`) |
| `FBI_REQUEST_TIMEOUT_MS` | No | Per-request timeout in milliseconds (default: 15000) |

---

## Implementation Order

1. Config and server setup (`FBI_API_KEY`, base URLs, timeout)
2. `UcrApiService` + `CdeApiService` with shared retry/timeout
3. `fbi_list_code_table` — reference data, no external dependencies
4. `fbi_search_agencies` + `fbi_get_agency` — agency lookup foundation
5. `fbi_get_participation` — critical context tool, needed before interpreting count tools
6. `fbi_get_crime_estimates` — national/state estimates (simplest UCR count endpoint)
7. `fbi_get_agency_offenses` — agency-level UCR counts (core utility)
8. `fbi_get_nibrs_breakdown` — NIBRS breakdown tool (most complex, many variable combos)
9. `fbi_get_arrests` + `fbi_get_arson` — standalone national count series
10. `fbi_get_hate_crimes` — hate crime counts + cross-tab variant
11. `fbi_get_human_trafficking` + `fbi_get_leoka` — specialty datasets
12. Resources (`fbi://agency/{ori}`, `fbi://state/{state_abbr}`)

Each step is independently testable.

---

## Domain Mapping

| Noun | API Operations | Tool |
|:-----|:--------------|:-----|
| Agency | search by state/type/city/ORI, get by ORI | `fbi_search_agencies`, `fbi_get_agency` |
| Agency offenses (UCR) | counts by ORI, state, county FIPS | `fbi_get_agency_offenses` |
| Crime estimates (UCR) | national, state | `fbi_get_crime_estimates` |
| NIBRS offenders | count by variable nationally/by state, filter by offense | `fbi_get_nibrs_breakdown` (dimension=offenders) |
| NIBRS victims | count by variable nationally/by state, filter by offense | `fbi_get_nibrs_breakdown` (dimension=victims) |
| NIBRS offenses | count by variable nationally/by state, filter by offense | `fbi_get_nibrs_breakdown` (dimension=offenses) |
| Arrests (UCR) | national counts by offense and year | `fbi_get_arrests` |
| Hate crimes | count by bias nationally/by state, cross-tab with offense | `fbi_get_hate_crimes` |
| Participation | national, state, agency; UCR vs. NIBRS rates | `fbi_get_participation` |
| Human trafficking | national, state, agency counts | `fbi_get_human_trafficking` |
| LEOKA | monthly/YTD officer killed/assaulted | `fbi_get_leoka` |
| Arson | national, state counts | `fbi_get_arson` |
| Reference codes | offense names, bias codes, location types, weapon types, pop group definitions | `fbi_list_code_table` |

---

## NIBRS Breakdown Variables

| Dimension | Valid `variable` values |
|:----------|:----------------------|
| `offenders` | `ethnicity`, `race_code`, `sex_code`, `age_num`, `offense_name`, `location_name`, `prop_desc_name` |
| `victims` | `ethnicity`, `race_code`, `sex_code`, `age_num`, `offense_name`, `location_name`, `prop_desc_name`, `offender_relationship`, `resident_status_code`, `circumstance_name` |
| `offenses` | `offense_name`, `weapon_name`, `location_name`, `method_entry_code`, `num_premises_entered` |

---

## Workflow Analysis

### "What's the crime trend in city X?"

1. `fbi_search_agencies` (state + city) → get ORI
2. `fbi_get_participation` (scope=agency, state) → confirm months reported and NIBRS adoption
3. `fbi_get_agency_offenses` (ori, year range) → UCR offense counts by year
4. Optionally: `fbi_get_nibrs_breakdown` (scope=state, same offense) → compare city trend against state demographic pattern

### "Compare violent crime across states"

1. `fbi_get_crime_estimates` (scope=state) → FBI-estimated violent crime per state
2. Chain to Census MCP server with state FIPS codes for per-capita rates

### "Who is committing hate crimes — and what's the trend?"

1. `fbi_get_hate_crimes` (scope=national, year range) → counts by bias type
2. `fbi_get_hate_crimes` (cross_offense=true) → which offense types bias incidents involve
3. `fbi_get_participation` (scope=state, year) → surface which states have low hate crime participation

### "Is the crime data for this county reliable?"

1. `fbi_search_agencies` (state + county) → list ORI codes
2. `fbi_get_participation` (scope=agency, state) → months reported, NIBRS adoption, population coverage per agency
3. Flag any agency with `months_reported < 12` or `nibrs = false` when presenting counts

### "Which agencies are reporting NIBRS?"

1. `fbi_get_participation` (scope=agency, nibrs_only=true, state) → NIBRS agencies with adoption year

---

## Design Decisions

**`fbi_get_nibrs_breakdown` (renamed from `fbi_get_crime_trends`).** The original name "trends" implies time-series UCR data, but this tool is a demographic/attribute breakdown of NIBRS incidents. The rename avoids routing an agent looking for "crime trends" to an NIBRS-specific cross-tab tool that may not have coverage in the target geography. The description leads with "NIBRS only" to make the data layer explicit.

**`fbi_get_crime_trends` consolidates 6 swagger endpoints.** The UCR swagger has separate paths for offenders/victims/offenses × national/state × with-offense/without-offense filter — 6 combinations. A `dimension` enum + `scope` enum + optional `offense_name` filter covers all of them in one tool. The LLM sees one concept ("break down NIBRS incidents by attribute") rather than six API-shaped endpoints.

**`fbi_get_agency_offenses` unifies 3 agency count paths.** The swagger has separate endpoints for agency-by-ORI, state-all-agencies, and county-filtered. The tool dispatches based on which parameters are present (`ori` → single agency; `state_abbr` → state list with optional `county_fips`). Same query intent, different scope. FIPS codes for the `county_fips` parameter come from the Census MCP server.

**UCR/NIBRS data layer labeled in every description.** Every tool description opens with a bracketed label (`**UCR Summary.**`, `**NIBRS only.**`, etc.) so an LLM routing a query can immediately distinguish which data layer it will receive — without reading parameter docs.

**`fbi_get_arrests` is national-only by design.** The UCR API does not expose state-level arrest breakdowns via this API. The description states this explicitly to prevent wasted calls.

**`fbi_list_code_table` enumerates valid table names in the description.** Unlike the previous `fbi_list_offense_codes` design (which left `table` as an undocumented free string), the tool description lists all 10+ valid table names. An agent that needs an offense name or bias code can pick the right table without guessing.

**Arson is separate from `fbi_get_crime_estimates`.** The UCR explicitly separates arson from property crime because its reporting completeness is lower. Keeping it separate prevents accidental double-counting when agents combine estimates with arson figures.

**No `fbi_get_nibrs_estimates` tool.** The CDE webapp has a "NIBRS estimates" page that projects national NIBRS figures, but this data is served by a newer CDE endpoint not yet fully documented or stable. Add in a follow-up once `/cde/LATEST/nibrs-estimates` is confirmed live.

**Participation is a dedicated standalone tool.** Some designs attach participation metadata to every count-returning tool. Instead, `fbi_get_participation` is explicit so agents chain it deliberately — making reliability assessment a conscious step rather than a silent annotation.

---

## Known Limitations

- **DEMO_KEY rate limit**: 1,000 req/hr shared across all DEMO_KEY users. Hosted deployments require a registered api.data.gov key.
- **NIBRS coverage gap**: Only agencies that have adopted NIBRS contribute to NIBRS breakdowns. As of 2024, ~40% of agencies (covering ~25% of population in some states) still report summary-only. `fbi_get_participation` surfaces coverage so callers can caveat findings.
- **No incident-level download**: The API returns aggregated counts, not raw NIBRS records. Bulk downloads exist at cde.ucr.cjis.gov but are multi-gigabyte files outside this server's scope.
- **State estimates vs. agency actuals**: `fbi_get_crime_estimates` returns FBI-adjusted estimates that fill in for non-reporting agencies. `fbi_get_agency_offenses` returns raw reported counts. These figures legitimately differ — tools document this distinction.
- **Rape definition break at 2013**: Definition changed from legacy to revised in 2013, creating a methodological break in long-term trend analysis. `fbi_get_crime_estimates` returns both `rape_legacy` and `rape_revised` fields; long-term analysis should use one series consistently.
- **Hate crime underreporting**: Reporting is voluntary and participation is highly variable by jurisdiction. National trends reflect reporting agency composition as much as actual incidents.
- **Arrest data is national only**: No state or agency breakdown available via this API.

---

## API Reference

### Key path patterns (UCR base: `https://api.usa.gov/crime/fbi/ucr`)

```
GET /agencies                                         # search agencies
GET /agencies/{ori}                                   # single agency profile
GET /estimates/national                               # national crime estimates by year
GET /estimates/states/{state_abbr}                    # state estimates
GET /offenders/count/national/{variable}              # NIBRS offender breakdown nationally
GET /offenders/count/states/{state_abbr}/{variable}   # ...by state
GET /offenders/count/national/{variable}/offenses     # ...filtered to offense
GET /victims/count/national/{variable}                # NIBRS victim breakdown
GET /offenses/count/national/{variable}               # NIBRS offense attribute breakdown
GET /agencies/count/{ori}/offenses                    # agency UCR offense counts
GET /agencies/count/states/offenses/{state_abbr}      # all-agency offense counts by state
GET /agencies/count/states/offenses/{state_abbr}/counties/{fips_code}
GET /arrests/national                                 # national arrest counts
GET /hc/count/national/{variable}                     # hate crime by bias nationally
GET /hc/count/states/{state_abbr}/{variable}          # ...by state
GET /participation/national                           # national UCR participation
GET /participation/states/{state_abbr}                # state participation
GET /participation/agencies                           # agency-level participation
GET /ht/agencies                                      # human trafficking by agency
GET /ht/states                                        # human trafficking by state
GET /arson/national                                   # arson counts nationally
GET /arson/states/{state_abbr}                        # arson counts by state
GET /codes/{code_table_id}                            # reference code tables
```

### CDE-specific endpoints (newer base: `https://api.usa.gov/crime/fbi/cde`)

```
GET /LATEST/participation/national/                   # updated national participation
GET /LATEST/participation/state/                      # updated state participation
GET /LATEST/participation/agency/                     # updated agency participation
GET /LATEST/leoka/monthly                             # officers killed/assaulted monthly
GET /LATEST/leoka/ytd                                 # year-to-date
```

### Pagination

All list endpoints support `page` (1-indexed) and `per_page`. Responses include a `pagination` object with `count`, `page`, `pages`, and `per_page`.

### Rate limits

- DEMO_KEY: ~1,000 req/hr (shared pool — unreliable for production)
- Registered key: higher limits, not publicly documented
- Retry-after header not returned; use exponential backoff on 429
