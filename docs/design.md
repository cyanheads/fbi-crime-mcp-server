# fbi-crime-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `fbi_get_crime_estimates` | Monthly CDE summarized offense rates and actual counts for the selected entity. | `scope` (national/state/agency), `offense`, `state_abbr` or `ori`, `from_year`/`from_month`, `to_year`/`to_month` | `readOnlyHint` |
| `fbi_get_agency_offenses` | Same summarized endpoint and entity selection as `fbi_get_crime_estimates`. | Same scope, offense, and monthly range parameters | `readOnlyHint` |
| `fbi_get_leoka` | Officer fatality trends, raw CDE YTD totals, weapons, circumstances, demographics, and timelines. | `period` (ytd/monthly), `year`, `month` (required for monthly) | `readOnlyHint` |
| `fbi_search_agencies` | Unavailable: decommissioned UCR agency search. | `state_abbr`, `agency_type`, `city`, `population_group`, `page`, `per_page` (unused) | `readOnlyHint` |
| `fbi_get_agency` | Unavailable: decommissioned UCR agency profile. | `ori` (unused) | `readOnlyHint` |
| `fbi_get_nibrs_breakdown` | Unavailable: decommissioned UCR NIBRS breakdown. | `dimension`, `variable`, `scope`, `state_abbr`, `offense_name`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_get_arrests` | Unavailable: decommissioned UCR arrests. | `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_get_hate_crimes` | Unavailable: decommissioned UCR hate crimes. | `scope`, `state_abbr`, `since_year`, `until_year`, `cross_offense` (unused) | `readOnlyHint` |
| `fbi_get_participation` | Unavailable: decommissioned UCR/CDE participation. | `scope`, `state_abbr`, `year`, `nibrs_only`, `page`, `per_page` (unused) | `readOnlyHint` |
| `fbi_get_human_trafficking` | Unavailable: decommissioned UCR human trafficking. | `scope`, `state_abbr`, `ori`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_get_arson` | Unavailable: use `fbi_get_crime_estimates` with `offense="arson"`. | `scope`, `state_abbr`, `since_year`, `until_year` (unused) | `readOnlyHint` |
| `fbi_list_code_table` | Unavailable: decommissioned UCR code tables. | `table` (unused) | `readOnlyHint` |

Unavailable tools retain their input contracts and throw `endpoint_decommissioned` without making upstream requests.

### Resources

| URI Template | Description |
|:-------------|:------------|
| `fbi://agency/{ori}` | Unavailable: reading the agency profile returns `ServiceUnavailable`. |
| `fbi://state/{state_abbr}` | Unavailable: reading state participation returns `ServiceUnavailable`. |

### Prompts

None — this is a data-oriented server.

---

## Overview

`fbi-crime-mcp-server` exposes the surviving FBI Crime Data Explorer (CDE) summarized and LEOKA endpoints. Three tools return data; nine legacy tools and both resources report decommissioned endpoints.

The summarized tools return per-100k offense/clearance rates and actual counts by month for national, state, or agency scope. They do not return the former annual adjusted estimates, county agency lists, participation metadata, or separate legacy/revised rape fields.

LEOKA returns fatality trends and circumstances. Both periods include `incidents_victim_officer_totals_ytd`, exposed as `totals` under its six raw keys. Monthly responses include comparison years in `officer_death_by_month` and omit `officer_death_by_year`; cumulative totals remain separate from month-specific breakdowns.

### LEOKA output

| Fields | Shape |
|:-------|:------|
| `totals` | `total_officers`, `total_incidents`, `total_officers_dod`, `total_officers_doi`, `total_incidents_dod`, `total_incidents_doi` |
| `weapons`, `officer_activity`, `lighting_conditions` | Category → count |
| `body_armor_worn`, `location_of_attack`, `offender_previously_known_to_agency`, `offender_prior_mental_illness`, `offender_prior_relationship`, `officer_circumstances_time_of_attack`, `officer_incident_type`, `officer_type_of_assignment`, `weather_conditions` | Category → count |
| `offender_demographic`, `officer_demographic` | Dimension → category → count |
| `officer_death_by_time_of_day` | Killing type → literal hour key (including `-1`) → count |
| `officer_death_by_month` | Killing type → year → month → count |
| `deaths_by_year`, `deaths_by_region` | Killing type → year/region → count |

Absent/null sections are omitted. Empty maps, null subgroups/leaves, and zeros remain distinct in structured and text output. All supplied paths are rendered, including unknown categories and comparison years.

---

## Requirements

- FBI CDE API key via api.data.gov registration
- Active base URL: `https://api.usa.gov/crime/fbi/cde`
- Read-only GET requests with timeout and retry
- Active tool year inputs accept 2000–2030; actual coverage depends on the upstream dataset
- Registered api.data.gov key recommended; DEMO_KEY shares a limited pool

---

## Services

| Service | Base URL | Used By |
|:--------|:---------|:--------|
| `FbiApiService` | `https://api.usa.gov/crime/fbi/cde` | `fbi_get_crime_estimates`, `fbi_get_agency_offenses`, `fbi_get_leoka` |

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
| Summarized offense data | National, state, agency monthly rates and actuals | `fbi_get_crime_estimates`, `fbi_get_agency_offenses` |
| LEOKA | YTD and monthly fatality trends and circumstances | `fbi_get_leoka` |

Legacy agency lookup, NIBRS, arrests, hate crimes, participation, human trafficking, and code-table capabilities are retained only as explicit unavailable contracts.

---

## NIBRS Breakdown Variables

Accepted by the retained input schema; the endpoint is unavailable.

| Dimension | Valid `variable` values |
|:----------|:----------------------|
| `offenders` | `ethnicity`, `race_code`, `sex_code`, `age_num`, `offense_name`, `location_name`, `prop_desc_name` |
| `victims` | `ethnicity`, `race_code`, `sex_code`, `age_num`, `offense_name`, `location_name`, `prop_desc_name`, `offender_relationship`, `resident_status_code`, `circumstance_name` |
| `offenses` | `offense_name`, `weapon_name`, `location_name`, `method_entry_code`, `num_premises_entered` |

---

## Workflow Analysis

### Crime trends for a known agency or state

1. Obtain the agency ORI outside this server, or supply a two-letter state abbreviation.
2. Call `fbi_get_crime_estimates` or `fbi_get_agency_offenses` with the matching `scope`, `offense`, and monthly range.
3. Compare entity-matched rates and actuals. Obtain participation context separately from the CDE website.

### Officer fatality trends and circumstances

Call `fbi_get_leoka` with `period="ytd"` and `year`, or `period="monthly"`, `year`, and `month`. Use the explicitly classified trend/region series for killing types; keep the raw CDE YTD totals separate.

---

## Design Decisions

**Entity selection comes from scoped actuals.** Agency responses also include state/national comparison rates. Selecting rates by the entity in `actuals` prevents reporting another jurisdiction's rate; absent scoped actuals produce `no_data`.

**LEOKA totals keep upstream names.** The CDE YTD block does not establish a combined-fatality total or a meaning for `dod`/`doi`. The former `total_officers_felonious`/`total_officers_accidental` and `total_incidents_felonious`/`total_incidents_accidental` aliases are replaced by the corresponding `_dod`/`_doi` keys without changing values.

**LEOKA preserves full breakdowns.** The same upstream request already supplies demographics, circumstances, and timelines. Typed nested count maps and complete text tables retain that data without extra requests or inferred counts.

**Unavailable contracts remain registered.** Legacy tools return explicit errors with recovery guidance. The dedicated arson tool points to the summarized endpoint through `fbi_get_crime_estimates`.

---

## Known Limitations

- Registered keys and DEMO_KEY are subject to upstream rate limits.
- Agency search and participation metadata are unavailable through this server.
- Missing scoped actuals are not replaced by national comparison data. Available actuals with absent rates retain nullable rates.
- Null/empty LEOKA envelopes return `no_data`. A monthly request for an unavailable year can instead fail with upstream HTTP 400.
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
GET /leoka/monthly?year={year}&month={month}
GET /leoka/ytd?year={year}
```

The CDE `/LATEST/participation/` paths are decommissioned.

### Pagination

The active summarized and LEOKA endpoints have no server-side paging contract. Legacy `page`/`per_page` inputs remain unused on unavailable tools.

### Rate limits

- DEMO_KEY: ~1,000 req/hr (shared pool — unreliable for production)
- Registered key: higher limits, not publicly documented
- Retry-after header not returned; use exponential backoff on 429
