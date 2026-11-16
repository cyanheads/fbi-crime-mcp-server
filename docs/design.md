# fbi-crime-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `fbi_search_agencies` | Agencies in one state with ORI, type, counties, and NIBRS status; local filters and paging over the CDE state directory. | `state_abbr`, `name_contains`, `county`, `agency_type`, `limit`, `offset` | `readOnlyHint` |
| `fbi_get_crime_estimates` | Monthly CDE summarized offense rates and actual counts for the selected entity; opt-in comparison rates. | `scope` (national/state/agency), `offense`, `state_abbr` or `ori`, `from_year`/`from_month`, `to_year`/`to_month`, `include_comparisons` | `readOnlyHint` |
| `fbi_get_hate_crimes` | Hate crime incident and bias-section totals summed over a month window; national/state/agency; opt-in monthly rows. | `scope`, `state_abbr` or `ori`, `bias`, `from_year`/`from_month`, `to_year`/`to_month`, `include_monthly` | `readOnlyHint` |
| `fbi_get_arrests` | Arrest totals by offense, arrestee sex and race, and age; national/state/agency; opt-in monthly rows. | `scope`, `state_abbr` or `ori`, `offense`, `from_year`/`from_month`, `to_year`/`to_month`, `include_monthly` | `readOnlyHint` |
| `fbi_get_nibrs_breakdown` | NIBRS victim, offender, and offense category totals for one offense; national/state/agency; opt-in monthly rows. | `scope`, `state_abbr` or `ori`, `offense`, `from_year`/`from_month`, `to_year`/`to_month`, `include_monthly` | `readOnlyHint` |
| `fbi_get_leoka` | Officer fatality trends, raw CDE YTD totals, weapons, circumstances, demographics, and timelines. | `period` (ytd/monthly), `year`, `month` (required for monthly) | `readOnlyHint` |
| `fbi_get_police_employees` | Annual law enforcement staffing: sworn officers and civilians by sex, employees per 1,000 people, participated population, coverage; national/state/agency. | `scope`, `state_abbr` or `ori`, `from_year`, `to_year` | `readOnlyHint` |
| `fbi_get_agency` | Unavailable: decommissioned UCR agency profile; `fbi_search_agencies` covers ORI, type, counties, and NIBRS status. | `ori` (unused) | `readOnlyHint` |
| `fbi_get_participation` | Unavailable: decommissioned UCR/CDE participation. | `scope`, `state_abbr`, `year`, `nibrs_only`, `page`, `per_page` (unused) | `readOnlyHint` |
| `fbi_get_human_trafficking` | Unavailable: decommissioned UCR human trafficking. | `scope`, `state_abbr`, `ori`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_get_arson` | Unavailable: use `fbi_get_crime_estimates` with `offense="arson"`. | `scope`, `state_abbr`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_list_code_table` | Unavailable: decommissioned UCR code tables. | `table` (unused) | `readOnlyHint` |

Seven tools are callable; five unavailable definitions retain their schemas and disabled reasons in the operator landing page and internal manifest. `disabledTool` omits them from MCP registration, so their stub handlers cannot run through MCP.

### Resources

None registered. The retired agency/state resource definitions remain on disk.

### Prompts

None — this is a data-oriented server.

### Skills

`skills/fbi-crime-guide/SKILL.md`, registered through `createApp({ skills: 'skills' })` and served as `skill://fbi-crime-guide/SKILL.md`. It carries the reporting gates that span tools (identifier stop rule, NIBRS start date, null versus zero, coverage before trends, partial trailing months, monthly rates, which category map holds a headline total, late staffing years, LEOKA totals). Per-tool contracts stay in the tool descriptions, and the agency chain stays in `instructions`, so the skill restates neither.

---

## Overview

`fbi-crime-mcp-server` exposes the surviving FBI Crime Data Explorer (CDE) endpoints: the summarized offense series, the state agency directory, hate-crime, arrest, and NIBRS totals, LEOKA, and the annual law enforcement employees series. Seven tools return data; five legacy tools are disabled, no resources are registered, and one skill (`fbi-crime-guide`) is served.

The summarized tool returns offense/clearance rates per 100,000 participating population, actual counts and nullable provider populations/coverage by month for national, state, or agency scope. `entity_name` comes from scoped actuals; `data_last_updated` and `max_data_date` retain provider dates. With `include_comparisons` on state or agency scope it also returns `comparisons`: the rates, populations, and coverage CDE sends for the comparison entities (an agency's state and the United States, or a state's United States) for exactly the scoped months. Scoped rows never take comparison values. It does not return the former annual adjusted estimates, county agency lists, agency participation metadata, or separate legacy/revised rape fields.

The hate-crime, arrest, and NIBRS tools return category-to-count maps for a `type=totals` window summed by CDE, at the same three scopes, plus an opt-in `monthly` series from `type=counts`. `fbi_get_police_employees` returns one row per year of male and female sworn officers, male and female civilians, CDE's published employees per 1,000 people, participated population, and coverage; years are whole (`from_year`/`to_year`), not months. `fbi_search_agencies` fetches one state's full agency directory and filters, sorts (agency name, then ORI), and pages it locally; it is the ORI discovery step for agency scope.

National requests omit both identifiers, state requests supply only `state_abbr`, and agency requests supply only `ori`. Identifier syntax is ASCII-only, with uppercase normalization and no membership whitelist. Full year/month endpoints must be chronological, and no year may be after the current UTC year (`year_out_of_range`). `include_comparisons` is rejected on national scope (`scope_param_incompatible`). YTD LEOKA rejects `month`; monthly requires it. These checks run before fetching; the scope, identifier, and range checks of the scoped tools live in `src/mcp-server/tools/cde-scoped-range.ts`.

LEOKA returns fatality trends and circumstances. Both periods include `incidents_victim_officer_totals_ytd`, exposed as `totals` under its six raw keys. Monthly responses carry only the requested month under each year of `officer_death_by_month` (requested and comparison year) and omit `deaths_by_year`; current-year YTD responses drop the months after the current UTC month, which CDE zero-fills. Cumulative totals remain separate from month-specific breakdowns.

### Category totals output

| Tool | Sections (category → count) |
|:-----|:----------------------------|
| `fbi_get_hate_crimes` | `incident_section`: `bias`, `bias_category`; `bias_section`: `offense_type`, `location_type`, `offender_race`, `offender_ethnicity`, `judicial_district` |
| `fbi_get_arrests` | `offense_name`, `offense_category`, `offense_breakdown`, `arrestee_sex`, `arrestee_race`, `male_arrests_by_age`, `female_arrests_by_age` |
| `fbi_get_nibrs_breakdown` | `victim`: `age`, `sex`, `race`, `location`, `ethnicity`, `relationship`; `offender`: `age`, `sex`, `race`, `ethnicity`; `offense_details`: `weapons`, `related_offenses` |

Every category CDE sends is kept, zeros and nulls included. Groupings are counted on separate bases, so they do not sum to one total. The payload is a fixed category set regardless of window: 286 cells for hate crimes, 175 for arrests, 261 for NIBRS.

With `include_monthly`, each tool also returns `monthly`: one row per month of the window for the scoped entity, from the `type=counts` view. Every row carries `year`, `month`, `population`, `participated_population`, and `population_coverage_percent`, plus the tool's series:

| Tool | Monthly count fields | Monthly rate fields |
|:-----|:---------------------|:--------------------|
| `fbi_get_hate_crimes` | `incident_count`, `offense_count` | `incident_rate_per_100k`, `offense_rate_per_100k` |
| `fbi_get_arrests` | `arrest_count` | `rate_per_100k` |
| `fbi_get_nibrs_breakdown` | `actual_count`, `clearance_count` | `rate_per_100k`, `clearance_rate_per_100k` |

CDE's `-1` rate (a month with no participating population) becomes `null`, and a count in a month whose `participated_population` is null is not a reported zero. For hate crimes and arrests, an unrecognized state or ORI returns an empty `monthly`; NIBRS fails with `no_data` before `monthly` is built.

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
- Year inputs run through the current UTC year, from 1985 (`fbi_get_crime_estimates`, `fbi_get_arrests`, `fbi_get_police_employees`), 1991 (`fbi_get_hate_crimes`, `fbi_get_nibrs_breakdown`), or 2020 (`fbi_get_leoka`); the floors are JSON Schema `minimum`s and the ceiling is checked per call
- Registered api.data.gov key recommended; DEMO_KEY shares a limited pool

---

## Services

| Service | Base URL | Used By |
|:--------|:---------|:--------|
| `FbiApiService` | `https://api.usa.gov/crime/fbi/cde` | `fbi_search_agencies`, `fbi_get_crime_estimates`, `fbi_get_hate_crimes`, `fbi_get_arrests`, `fbi_get_nibrs_breakdown`, `fbi_get_leoka`, `fbi_get_police_employees` |

`getPoliceEmployees` serves `fbi_get_police_employees`, and `getCounts` serves the `include_monthly` view of the hate-crime, arrest, and NIBRS tools. The service validates raw response shapes before handlers select data. Legitimate absence becomes `no_data` in the handler; malformed records and HTTP failures remain errors with their own classifications. A 200 body that is not JSON fails once as a serialization error, while an HTML page is retried as the upstream being unavailable. Every request's attempts and backoffs share one 50-second deadline, so a hung upstream fails before an MCP client's default 60-second timeout.

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `FBI_API_KEY` | Yes | api.data.gov API key for the FBI CDE API |
| `FBI_API_BASE_CDE` | No | Override CDE base URL (default: `https://api.usa.gov/crime/fbi/cde`) |
| `FBI_REQUEST_TIMEOUT_MS` | No | Timeout for each attempt of a CDE request in milliseconds, bounded by the 50-second deadline the request's attempts share (default: 15000) |
| `FBI_CLAMP_LIMITS` | No | Serve an `fbi_search_agencies` limit above 200 at 200 with a notice; `false` advertises maximum 200 and rejects a larger limit (default: `true`) |

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
| Law enforcement employees | Annual sworn-officer and civilian counts by sex, employees per 1,000 people, participated population, coverage; national/state/agency | `fbi_get_police_employees` |

Legacy agency profile, participation, human trafficking, arson and code-table definitions are retained only as disabled operator records.

---

## NIBRS Breakdown Shape

`fbi_get_nibrs_breakdown` returns CDE's `type=totals` payload for one NIBRS offense code (71 codes, listed on the `offense` field). The payload is a fixed set of 261 category cells, constant across scope, offense, and window:

| Section | Dimension (categories) |
|:--------|:-----------------------|
| `victim` | `age` (11), `sex` (4), `race` (9), `location` (65), `ethnicity` (5), `relationship` (30) |
| `offender` | `age` (11), `sex` (4), `race` (9), `ethnicity` (5) |
| `offense_details` | `weapons` (22), `related_offenses` (86) |

CDE names the last section `offense`; the output renames it `offense_details` because `offense` echoes the selector. Dimensions are tallied separately and do not sum to one total. An unrecognized state or ORI, CDE's listed `23*` (Not Specified), windows with no NIBRS data, months an agency has not submitted, and an offense with no reported incidents in the window (San Antonio PD, `TXSPD0000`, for Treason `101` in 2023) return every count null, which the tool maps to `no_data`.

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

**The caller's window and `include_comparisons` bound the monthly response; the server applies no byte budget.** `fbi_get_crime_estimates` returns every month of the requested window in one call, so no page repeats the scope metadata. The heaviest call (an agency, 1985 through the current year, with comparisons) is about 390 KB, which MCP clients handle whole.

**One scope and date contract for scoped tools.** `src/mcp-server/tools/cde-scoped-range.ts` holds the scope/identifier/year/month fields and the pre-fetch checks shared by the summarized, hate-crime, arrest, and NIBRS tools, so the four cannot drift on identifier rules, year floors, or error reasons. Each tool still declares its `errors[]` inline.

**The year ceiling is checked per call.** The ceiling is the current UTC year, read on every call. A schema `maximum` would be fixed when the process starts and go stale across New Year; the floors stay in the schema as `minimum`.

**Selector enums are local.** CDE answers an unknown bias, offense, or NIBRS code (and an unknown state or ORI) with HTTP 200 zeros or nulls, indistinguishable from a real zero, so the tools enumerate the codes locally and reject the rest. Arrest code `23` (Rape - Not Specified) is left out of the arrest enum because CDE returns all zeros for it from 1985 through 2025; NIBRS `23*` (Not Specified) is left out because it returns only nulls. Code `320` (Suspicion) is included. An arrest code counts only its own CDE Offense Breakdown row, so its label follows its place in the category: a code in a multi-code Offense Category carries its Offense Breakdown row name, and a code that is its whole category carries the category name (CDE's "Not Specified" on a lone row would read as a subset).

**All-zero totals succeed with a notice; all-null NIBRS fails.** Hate-crime and arrest zeros can mean either no reports or an unrecognized state or ORI, so the result carries a notice naming the ambiguity. With `include_monthly`, `actuals: null` in the monthly view marks an unrecognized identifier and the notice says so; a recognized identifier gets wording that does not suggest an unknown one, and one with no `participated_population` in any month of the window is told the zeros are not reported counts. NIBRS answers unknown identifiers, months an agency has not submitted, and an offense with no reported incidents in the window with nulls, which the tool maps to `no_data` (a 261-cell all-null table carries nothing); the recovery hint names the causes, identifier first, and at agency scope points to `fbi_get_arrests` with `include_monthly` to see which months the agency submitted.

**LEOKA drops fill months rather than nulling them.** CDE zero-fills `officer_death_by_month` beyond what a response covers. A null would read as provider-unavailable, which is a different claim, so uncovered months are omitted and every remaining zero is a reported count.

**LEOKA totals keep upstream names.** The CDE YTD block does not establish a combined-fatality total or a meaning for `dod`/`doi`. The former `total_officers_felonious`/`total_officers_accidental` and `total_incidents_felonious`/`total_incidents_accidental` aliases are replaced by the corresponding `_dod`/`_doi` keys without changing values.

**LEOKA preserves full breakdowns.** The same upstream request already supplies demographics, circumstances, and timelines. Typed nested count maps and complete text tables retain that data without extra requests or inferred counts.

**Coverage is provider-only.** Population, participating population and coverage are looked up by the same scoped entity/month as offenses. Missing agency coverage stays null even when comparison coverage exists or agency populations match; denominator-only months do not add rows. No extra request or inferred percentage is needed.

**Monthly rows are opt-in.** The `type=totals` view the three totals tools read has no NIBRS offense or clearance counts, no participation, and no month-by-month movement; the `type=counts` view has all of them. `include_monthly` defaults to `false` so the default output and its single request are unchanged. When set, the totals and counts requests run in parallel on one signal (wall time is the slower of the two): the first to fail aborts the other, so a request partway through its retries stops spending key quota, and the call fails with that first error; caller cancellation aborts both. The whole window returns with no byte budget.

**County matching ignores spelling and suffix.** CDE stores county names with no suffix (none of 3,195 ends in Parish, Borough, Census Area, Municipality, or City and Borough; only `UNMAPPED COUNTY` ends in County). The filter compares letters and digits only, with accents folded and modifier letters such as the ʻokina dropped, and matches the name as given first. It strips one trailing suffix only when the name equals no county anywhere in the state directory. City is never stripped: CDE stores independent cities with it, and stripping would send New Jersey's Union City (in `HUDSON`) to `UNION`. No two county names in one state collide under this rule, so a query that matched before keeps exactly its agencies.

**A `limit` above 200 is clamped, not rejected.** `fbi_search_agencies` serves a limit above 200 at 200 with a notice naming both values and advertises no `maximum`; a 200-row Texas page is about 32 KB of `structuredContent`, and all 1,772 Texas agencies about 288 KB. `FBI_CLAMP_LIMITS=false` restores `maximum: 200` and rejection. The mode reaches the schema through `setup()`, never a config read at import: `tool()` emits input schemas at import, and under Node that runs before `.env` loads.

**Police employees build their own paths and pass the published rate through.** `/pe` does not share the scope paths of the other tools: `/pe/national` and `/pe/state/WA` answer HTTP 200 with every value null, so the service builds `/pe`, `/pe/{ABBR}`, and `/pe/agency/{ORI}` itself. The endpoint takes bare years (`from=2017`; MM-YYYY gets HTTP 400). `employees_per_1000` is CDE's published rate, never recomputed: Washington 2021 publishes 1.96 where the counts over the participated population compute 1.97.

**Retired contracts are disabled.** The HTTP landing page retains operator reasons and schemas without invocation snippets; MCP discovery exposes only working tools. Retired resources are unregistered.

---

## Known Limitations

- Registered keys and DEMO_KEY are subject to upstream rate limits.
- Agency profiles and agency participation metadata are unavailable through this server; `fbi_search_agencies` returns ORI, type, counties, and NIBRS status, and summarized monthly population/coverage fields are retained when supplied.
- The agency directory covers the 50 states, DC, PR, GU, and VI; AS and MP have none, and CDE reads lowercase or unknown codes as having no directory. Name, county, and type filters run locally over the whole state directory, and the directory has no city or population filters.
- Missing scoped actuals are not replaced by national comparison data. Available actuals with absent rates retain nullable rates.
- Null/empty LEOKA envelopes return `no_data`. Years after the current UTC year fail locally with `year_out_of_range`; a monthly request CDE rejects can still fail with upstream HTTP 400, classified independently of absence.
- The current-year YTD month cutoff for LEOKA and the year ceiling use the UTC clock, so for the first hours of a UTC month or year CDE may still zero-fill the new month or reject the new year.
- Hate-crime and arrest zeros cannot distinguish nothing-reported from an unrecognized state or ORI unless `include_monthly` is set; the tools say so in a notice.
- NIBRS nulls cannot distinguish an unrecognized state or ORI, months an agency has not submitted, and an offense with no reported incidents in the window; all fail `no_data`, and the recovery hint covers them.
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
GET /hate-crime/{national|state/{STATE}|agency/{ORI}}/{bias}?type=counts&from=MM-YYYY&to=MM-YYYY
GET /arrest/{national|state/{STATE}|agency/{ORI}}/{offense}?type=counts&from=MM-YYYY&to=MM-YYYY
GET /nibrs/{national|state/{STATE}|agency/{ORI}}/{offense}?type=counts&from=MM-YYYY&to=MM-YYYY
GET /leoka/monthly?year={year}&month={month}
GET /leoka/ytd?year={year}
GET /pe?from={YYYY}&to={YYYY}
GET /pe/{ABBR}?from={YYYY}&to={YYYY}
GET /pe/agency/{ORI}?from={YYYY}&to={YYYY}
```

The CDE `/LATEST/participation/` paths are decommissioned.

Endpoint notes:

- `/agency/byStateAbbr/{STATE}` returns every agency in the state grouped by county in one response and ignores `county_name` and `data_year`. A lowercase or unrecognized code answers HTTP 200 with a `cde_agencies_query` object whose `counties` is null, which the service maps to no directory.
- The totals endpoints require `type`; absent, CDE answers HTTP 400 "Invalid 'type'". The tools send `type=totals` explicitly, and `type=counts` for `include_monthly`. CDE rejects windows before the endpoint's first year (hate crime and NIBRS 1991, arrest 1985), years past the current one, and word-slug arrest selectors such as `robbery`.
- An unknown bias or arrest code, state, or ORI answers HTTP 200 with every count zero; for NIBRS, an unknown offense code, state, or ORI, and an offense with no reported incidents in the window, answer HTTP 200 with every count null.
- `type=counts` needs `MM-YYYY` bounds (`YYYY-MM` answers HTTP 400). Month keys arrive in `MM-YYYY` string order, so the tools sort them chronologically. A `-1` rate marks a month with no participating population. NIBRS nests its series under `offenses`; hate-crime and arrest put rates and actuals at the top level. An unknown state or ORI gets `actuals: null`, while a recognized agency that reported nothing gets every month null. Agency coverage is null.
- `/pe` takes whole years only: `MM-YYYY` bounds answer HTTP 400. It does not serve `/pe/national` or `/pe/state/{STATE}`; both answer HTTP 200 with every value null, as do lowercase identifiers and a year CDE has not published. Coverage (`Percent of Population Coverage`) is sent for state and national scope only.
- Legacy UCR equivalents served by the CDE paths above: `/agencies` by `/agency/byStateAbbr/`, `/arrests/national` by `/arrest/`, `/hc/count/...` by `/hate-crime/`, and the `/offenders`, `/victims`, `/offenses` NIBRS counts by `/nibrs/`.

### Pagination

The CDE endpoints have no server-side paging contract. `fbi_search_agencies` pages the state directory locally with `limit`, `offset`, and `next_offset` over a stable agency-name-then-ORI sort. `fbi_get_crime_estimates` returns the whole requested month window in one call. A `limit` above 200 on `fbi_search_agencies` is clamped to 200 (`FBI_CLAMP_LIMITS`). The totals endpoints return fixed-size payloads; `include_monthly` adds one row per month of the window, returned whole (national arrests 1985–2025: 492 rows). Legacy `page`/`per_page` inputs remain only in the disabled `fbi_get_participation` definition.

### Rate limits

- DEMO_KEY: 30 requests an hour and 50 a day per IP address — unreliable for production
- Registered key: 1,000 requests an hour (api.data.gov default)
- Retry-after header not returned; use exponential backoff on 429
- The gateway's own refusals (403 `API_KEY_*`, 429 `OVER_RATE_LIMIT`) carry a recovery hint naming the next step; the gateway's error body stays server-side
