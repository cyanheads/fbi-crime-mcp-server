# fbi-crime-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `fbi_search_agencies` | Agencies in one state with ORI, type, counties, and NIBRS status; local filters and paging over the CDE state directory. | `state_abbr`, `name_contains`, `county`, `agency_type`, `limit`, `offset` | `readOnlyHint` |
| `fbi_get_crime_estimates` | Monthly CDE summarized offense rates and actual counts for the selected entity; opt-in comparison rates. | `scope` (national/state/agency), `offense`, `state_abbr` or `ori`, `from_year`/`from_month`, `to_year`/`to_month`, `include_comparisons` | `readOnlyHint` |
| `fbi_get_hate_crimes` | Hate crime incident and bias-section totals summed over a month window; national/state/agency. | `scope`, `state_abbr` or `ori`, `bias`, `from_year`/`from_month`, `to_year`/`to_month` | `readOnlyHint` |
| `fbi_get_arrests` | Arrest totals by offense, arrestee sex and race, and age; national/state/agency. | `scope`, `state_abbr` or `ori`, `offense`, `from_year`/`from_month`, `to_year`/`to_month` | `readOnlyHint` |
| `fbi_get_nibrs_breakdown` | NIBRS victim, offender, and offense category totals for one offense; national/state/agency. | `scope`, `state_abbr` or `ori`, `offense`, `from_year`/`from_month`, `to_year`/`to_month` | `readOnlyHint` |
| `fbi_get_leoka` | Officer fatality trends, raw CDE YTD totals, weapons, circumstances, demographics, and timelines. | `period` (ytd/monthly), `year`, `month` (required for monthly) | `readOnlyHint` |
| `fbi_get_agency` | Unavailable: decommissioned UCR agency profile; `fbi_search_agencies` covers ORI, type, counties, and NIBRS status. | `ori` (unused) | `readOnlyHint` |
| `fbi_get_participation` | Unavailable: decommissioned UCR/CDE participation. | `scope`, `state_abbr`, `year`, `nibrs_only`, `page`, `per_page` (unused) | `readOnlyHint` |
| `fbi_get_human_trafficking` | Unavailable: decommissioned UCR human trafficking. | `scope`, `state_abbr`, `ori`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_get_arson` | Unavailable: use `fbi_get_crime_estimates` with `offense="arson"`. | `scope`, `state_abbr`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_list_code_table` | Unavailable: decommissioned UCR code tables. | `table` (unused) | `readOnlyHint` |

Six tools are callable; five unavailable definitions retain their schemas and disabled reasons in the operator landing page and internal manifest. `disabledTool` omits them from MCP registration, so their stub handlers cannot run through MCP.

### Resources

None registered. The retired agency/state resource definitions remain on disk.

### Prompts

None — this is a data-oriented server.

---

## Overview

`fbi-crime-mcp-server` exposes the surviving FBI Crime Data Explorer (CDE) endpoints: the summarized offense series, the state agency directory, hate-crime, arrest, and NIBRS totals, and LEOKA. Six tools return data; five legacy tools are disabled and no resources are registered.

The summarized tool returns offense/clearance rates per 100,000 participating population, actual counts and nullable provider populations/coverage by month for national, state, or agency scope. `entity_name` comes from scoped actuals; `data_last_updated` and `max_data_date` retain provider dates. With `include_comparisons` on state or agency scope it also returns `comparisons`: the rates, populations, and coverage CDE sends for the comparison entities (an agency's state and the United States, or a state's United States) for exactly the scoped months. Scoped rows never take comparison values. It does not return the former annual adjusted estimates, county agency lists, agency participation metadata, or separate legacy/revised rape fields.

The hate-crime, arrest, and NIBRS tools return category-to-count maps for a `type=totals` window summed by CDE, at the same three scopes. `fbi_search_agencies` fetches one state's full agency directory and filters, sorts (agency name, then ORI), and pages it locally; it is the ORI discovery step for agency scope.

National requests omit both identifiers, state requests supply only `state_abbr`, and agency requests supply only `ori`. Identifier syntax is ASCII-only, with uppercase normalization and no membership whitelist. Full year/month endpoints must be chronological, and no year may be after the current UTC year (`year_out_of_range`). `include_comparisons` is rejected on national scope (`scope_param_incompatible`). YTD LEOKA rejects `month`; monthly requires it. These checks run before fetching; the scope, identifier, and range checks of the scoped tools live in `src/mcp-server/tools/cde-scoped-range.ts`.

LEOKA returns fatality trends and circumstances. Both periods include `incidents_victim_officer_totals_ytd`, exposed as `totals` under its six raw keys. Monthly responses carry only the requested month under each year of `officer_death_by_month` (requested and comparison year) and omit `deaths_by_year`; current-year YTD responses drop the months after the current UTC month, which CDE zero-fills. Cumulative totals remain separate from month-specific breakdowns.

### Category totals output

| Tool | Sections (category → count) |
|:-----|:----------------------------|
| `fbi_get_hate_crimes` | `incident_section`: `bias`, `bias_category`; `bias_section`: `offense_type`, `location_type`, `offender_race`, `offender_ethnicity`, `judicial_district` |
| `fbi_get_arrests` | `offense_name`, `offense_category`, `offense_breakdown`, `arrestee_sex`, `arrestee_race`, `male_arrests_by_age`, `female_arrests_by_age` |
| `fbi_get_nibrs_breakdown` | `victim`: `age`, `sex`, `race`, `location`, `ethnicity`, `relationship`; `offender`: `age`, `sex`, `race`, `ethnicity`; `offense_details`: `weapons`, `related_offenses` |

Every category CDE sends is kept, zeros and nulls included. Groupings are counted on separate bases, so they do not sum to one total. The payload is a fixed category set regardless of window: 286 cells for hate crimes, 175 for arrests, 261 for NIBRS.

### LEOKA output

| Fields | Shape |
|:-------|:------|
| `totals` | `total_officers`, `total_incidents`, `total_officers_dod`, `total_officers_doi`, `total_incidents_dod`, `total_incidents_doi` |
| `weapons`, `officer_activity`, `lighting_conditions` | Category → count |
| `body_armor_worn`, `location_of_attack`, `offender_previously_known_to_agency`, `offender_prior_mental_illness`, `offender_prior_relationship`, `officer_circumstances_time_of_attack`, `officer_incident_type`, `officer_type_of_assignment`, `weather_conditions` | Category → count |
| `offender_demographic`, `officer_demographic` | Dimension → category → count |
| `officer_death_by_time_of_day` | Killing type → literal hour key (including `-1`) → count |
| `officer_death_by_month` | Killing type → year → month → count, covered months only |
| `deaths_by_year`, `deaths_by_region` | Killing type → year/region → count; the year window can extend past the requested year and the current year is year-to-date |

Absent/null sections are omitted. Empty maps, null subgroups/leaves, and zeros remain distinct in structured and text output. All supplied paths are rendered, including unknown categories and comparison years, except `officer_death_by_month`, which renders only covered months (fill months are dropped from both surfaces).

---

## Requirements

- FBI CDE API key via api.data.gov registration
- Active base URL: `https://api.usa.gov/crime/fbi/cde`
- Read-only GET requests with timeout and retry
- Year inputs run through the current UTC year, from 1985 (`fbi_get_crime_estimates`, `fbi_get_arrests`), 1991 (`fbi_get_hate_crimes`, `fbi_get_nibrs_breakdown`), or 2020 (`fbi_get_leoka`); the floors are JSON Schema `minimum`s and the ceiling is checked per call
- Registered api.data.gov key recommended; DEMO_KEY shares a limited pool

---

## Services

| Service | Base URL | Used By |
|:--------|:---------|:--------|
| `FbiApiService` | `https://api.usa.gov/crime/fbi/cde` | `fbi_search_agencies`, `fbi_get_crime_estimates`, `fbi_get_hate_crimes`, `fbi_get_arrests`, `fbi_get_nibrs_breakdown`, `fbi_get_leoka` |

The service validates raw response shapes before handlers select data. Legitimate absence becomes `no_data` in the handler; malformed records, invalid JSON, and HTTP failures remain errors with their own classifications.

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `FBI_API_KEY` | Yes | api.data.gov API key for the FBI CDE API |
| `FBI_API_BASE_UCR` | No | Override UCR base URL (default: `https://api.usa.gov/crime/fbi/ucr`) |
| `FBI_API_BASE_CDE` | No | Override CDE base URL (default: `https://api.usa.gov/crime/fbi/cde`) |
| `FBI_REQUEST_TIMEOUT_MS` | No | Per-request timeout in milliseconds (default: 15000) |

---

## Domain Mapping

| Noun | API Operations | Tool |
|:-----|:---------------|:-----|
| Agency directory | One state's agencies with ORI, type, counties, NIBRS status | `fbi_search_agencies` |
| Summarized offense data | National, state, agency monthly rates, actuals, population denominators and coverage | `fbi_get_crime_estimates` |
| Hate crime totals | Incident and bias-section category counts, national/state/agency | `fbi_get_hate_crimes` |
| Arrest totals | Offense, arrestee sex/race, and age category counts, national/state/agency | `fbi_get_arrests` |
| NIBRS totals | Victim, offender, and offense category counts for one offense, national/state/agency | `fbi_get_nibrs_breakdown` |
| LEOKA | YTD and monthly fatality trends and circumstances | `fbi_get_leoka` |

Legacy agency profile, participation, human trafficking, arson and code-table definitions are retained only as disabled operator records.

---

## NIBRS Breakdown Shape

`fbi_get_nibrs_breakdown` returns CDE's `type=totals` payload for one NIBRS offense code (71 codes, listed on the `offense` field). The payload is a fixed set of 261 category cells, constant across scope, offense, and window:

| Section | Dimension (categories) |
|:--------|:-----------------------|
| `victim` | `age` (11), `sex` (4), `race` (9), `location` (65), `ethnicity` (5), `relationship` (30) |
| `offender` | `age` (11), `sex` (4), `race` (9), `ethnicity` (5) |
| `offense_details` | `weapons` (22), `related_offenses` (86) |

CDE names the last section `offense`; the output renames it `offense_details` because `offense` echoes the selector. Dimensions are tallied separately and do not sum to one total. An unrecognized state or ORI, CDE's listed `23*` (Not Specified), windows with no NIBRS data, and an offense with no reported incidents in the window (San Antonio PD, `TXSPD0000`, for Treason `101` in 2023) return every count null, which the tool maps to `no_data`.

---

## Workflow Analysis

### Crime trends for a known agency or state

1. Call `fbi_search_agencies` with the state and name words or county to get the agency ORI, or supply a two-letter state abbreviation.
2. Call `fbi_get_crime_estimates` with only the identifier required by `scope`, the `offense`, and a chronological monthly range.
3. Compare entity-matched rates, actuals and provider population/coverage fields. Missing coverage remains unavailable.

### Officer fatality trends and circumstances

Call `fbi_get_leoka` with `period="ytd"` and `year`, or `period="monthly"`, `year`, and `month`. Use the explicitly classified trend/region series for killing types; keep the raw CDE YTD totals separate.

---

## Design Decisions

**Entity selection comes from scoped actuals.** Agency responses also include state/national comparison rates. Selecting rates by the entity in `actuals` prevents reporting another jurisdiction's rate; absent scoped actuals produce `no_data`. Comparison entities are returned only inside `comparisons` when requested and never substituted into the scoped rows.

**Comparisons are opt-in.** `include_comparisons` defaults to `false` because returning the comparison entities always more than doubles an agency response; callers that want the state and national rates ask for them.

**One scope and date contract for scoped tools.** `src/mcp-server/tools/cde-scoped-range.ts` holds the scope/identifier/year/month fields and the pre-fetch checks shared by the summarized, hate-crime, arrest, and NIBRS tools, so the four cannot drift on identifier rules, year floors, or error reasons. Each tool still declares its `errors[]` inline.

**The year ceiling is checked per call.** The ceiling is the current UTC year, read on every call. A schema `maximum` would be fixed when the process starts and go stale across New Year; the floors stay in the schema as `minimum`.

**Selector enums are local.** CDE answers an unknown bias, offense, or NIBRS code (and an unknown state or ORI) with HTTP 200 zeros or nulls, indistinguishable from a real zero, so the tools enumerate the codes locally and reject the rest. Arrest code `23` (Rape - Not Specified) is left out of the arrest enum because CDE returns all zeros for it from 1985 through 2025; NIBRS `23*` (Not Specified) is left out because it returns only nulls.

**All-zero totals succeed with a notice; all-null NIBRS fails.** Hate-crime and arrest zeros can mean either no reports or an unrecognized state or ORI, so the result carries a notice naming the ambiguity. NIBRS answers both unknown identifiers and an offense with no reported incidents in the window with nulls, which the tool maps to `no_data` (a 261-cell all-null table carries nothing); the recovery hint names both causes, identifier first.

**LEOKA drops fill months rather than nulling them.** CDE zero-fills `officer_death_by_month` beyond what a response covers. A null would read as provider-unavailable, which is a different claim, so uncovered months are omitted and every remaining zero is a reported count.

**LEOKA totals keep upstream names.** The CDE YTD block does not establish a combined-fatality total or a meaning for `dod`/`doi`. The former `total_officers_felonious`/`total_officers_accidental` and `total_incidents_felonious`/`total_incidents_accidental` aliases are replaced by the corresponding `_dod`/`_doi` keys without changing values.

**LEOKA preserves full breakdowns.** The same upstream request already supplies demographics, circumstances, and timelines. Typed nested count maps and complete text tables retain that data without extra requests or inferred counts.

**Coverage is provider-only.** Population, participating population and coverage are looked up by the same scoped entity/month as offenses. Missing agency coverage stays null even when comparison coverage exists or agency populations match; denominator-only months do not add rows. No extra request or inferred percentage is needed.

**Retired contracts are disabled.** The HTTP landing page retains operator reasons and schemas without invocation snippets; MCP discovery exposes only working tools. Retired resources are unregistered.

---

## Known Limitations

- Registered keys and DEMO_KEY are subject to upstream rate limits.
- Agency profiles and agency participation metadata are unavailable through this server; `fbi_search_agencies` returns ORI, type, counties, and NIBRS status, and summarized monthly population/coverage fields are retained when supplied.
- The agency directory covers the 50 states, DC, PR, GU, and VI; AS and MP have none, and CDE reads lowercase or unknown codes as having no directory. Name, county, and type filters run locally over the whole state directory, and the directory has no city or population filters.
- Missing scoped actuals are not replaced by national comparison data. Available actuals with absent rates retain nullable rates.
- Null/empty LEOKA envelopes return `no_data`. Years after the current UTC year fail locally with `year_out_of_range`; a monthly request CDE rejects can still fail with upstream HTTP 400, classified independently of absence.
- The current-year YTD month cutoff for LEOKA and the year ceiling use the UTC clock, so for the first hours of a UTC month or year CDE may still zero-fill the new month or reject the new year.
- Hate-crime and arrest zeros cannot distinguish nothing-reported from an unrecognized state or ORI; the tools say so in a notice.
- NIBRS nulls cannot distinguish an unrecognized state or ORI from an offense with no reported incidents in the window; both fail `no_data`, and the recovery hint covers both.
- LEOKA `dod`/`doi` abbreviations are uninterpreted; totals are not combined-fatality or requested-month counts.
- The API returns aggregates, not incident-level downloads.

---

## API Reference

### Decommissioned paths (UCR base: `https://api.usa.gov/crime/fbi/ucr`)

Historical endpoint inventory; these paths are not called by the active service.

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

### Active CDE endpoints (base: `https://api.usa.gov/crime/fbi/cde`)

```
GET /summarized/national/{offense}?from=MM-YYYY&to=MM-YYYY
GET /summarized/state/{state_abbr}/{offense}?from=MM-YYYY&to=MM-YYYY
GET /summarized/agency/{ori}/{offense}?from=MM-YYYY&to=MM-YYYY
GET /agency/byStateAbbr/{STATE}
GET /hate-crime/{national|state/{STATE}|agency/{ORI}}/{bias}?type=totals&from=MM-YYYY&to=MM-YYYY
GET /arrest/{national|state/{STATE}|agency/{ORI}}/{offense}?type=totals&from=MM-YYYY&to=MM-YYYY
GET /nibrs/{national|state/{STATE}|agency/{ORI}}/{offense}?type=totals&from=MM-YYYY&to=MM-YYYY
GET /leoka/monthly?year={year}&month={month}
GET /leoka/ytd?year={year}
```

The CDE `/LATEST/participation/` paths are decommissioned.

Endpoint notes:

- `/agency/byStateAbbr/{STATE}` returns every agency in the state grouped by county in one response and ignores `county_name` and `data_year`. A lowercase or unrecognized code answers HTTP 200 with a `cde_agencies_query` object whose `counties` is null, which the service maps to no directory.
- The totals endpoints take `type=totals`; the tools send it explicitly. CDE rejects windows before the endpoint's first year (hate crime and NIBRS 1991, arrest 1985), years past the current one, and word-slug arrest selectors such as `robbery`.
- An unknown bias or arrest code, state, or ORI answers HTTP 200 with every count zero; for NIBRS, an unknown offense code, state, or ORI, and an offense with no reported incidents in the window, answer HTTP 200 with every count null.
- Legacy UCR equivalents now served by the CDE paths above: `/agencies` by `/agency/byStateAbbr/`, `/arrests/national` by `/arrest/`, `/hc/count/...` by `/hate-crime/`, and the `/offenders`, `/victims`, `/offenses` NIBRS counts by `/nibrs/`.

### Pagination

The CDE endpoints have no server-side paging contract. `fbi_search_agencies` pages the state directory locally with `limit`, `offset`, and `next_offset` over a stable agency-name-then-ORI sort. The totals endpoints return fixed-size payloads. Legacy `page`/`per_page` inputs remain only in the disabled `fbi_get_participation` definition.

### Rate limits

- DEMO_KEY: ~1,000 req/hr (shared pool — unreliable for production)
- Registered key: higher limits, not publicly documented
- Retry-after header not returned; use exponential backoff on 429
