---
name: fbi-crime-guide
description: Gates for reporting FBI Crime Data Explorer figures from the fbi_* tools, covering where an agency ORI comes from, an unrecognized state or ORI versus one that reported nothing, null versus zero, which category map holds a headline total, and reporting coverage before comparing years or months. Use before stating a crime count, rate, trend, arrest or hate-crime total, or staffing figure from fbi_get_* results.
license: Apache-2.0
metadata:
  author: cyanheads
  version: "1.0"
---

## Scope

Aggregate US crime statistics from the FBI Crime Data Explorer (CDE): monthly offense counts and rates, arrest, hate-crime, and NIBRS category totals, and annual police staffing, each for the nation, one state, or one agency, plus national officer-fatality (LEOKA) data. There are no incident-level records, no city or county scope (only the agencies serving them), and no agency profiles or participation records.

## Identifiers

- **ORI**: the nine-character agency code agency scope takes. Get it only from `fbi_search_agencies`; never build or guess one. The tools check its shape, not whether CDE knows it, and CDE answers an unknown ORI with zeros, nulls, or `no_data` depending on the tool (Gate 1).
- A place is usually served by several agencies (city police, county sheriff, campus police, state police), each with its own ORI. The state directory has no city filter, so search it by words of the agency's name, then pick the agency deliberately and name it beside every figure.
- Selector codes differ by tool: `fbi_get_crime_estimates` takes word offenses, `fbi_get_arrests` and `fbi_get_nibrs_breakdown` take separate numeric code sets (Robbery is arrest code `30` but NIBRS code `120`). Each tool lists its codes on the field.

## Gates

1. **Confirm the identifier before reporting that nothing happened.** Below national scope, CDE answers an unrecognized state or ORI the way it answers "nothing reported."
   - `fbi_get_hate_crimes` and `fbi_get_arrests` return every count as zero with a notice. Report zero only when the notice says CDE recognizes the state or ORI, which it says once `include_monthly` is set, and the monthly rows show reporting: a month whose `participated_population` is null was not reported, so an agency with every month null reported nothing, not zero.
   - `fbi_get_crime_estimates`, `fbi_get_nibrs_breakdown`, and `fbi_get_police_employees` fail with `no_data`. Confirm the ORI with `fbi_search_agencies` (or the state code) before saying the agency reported nothing.
2. **NIBRS for an agency starts at its NIBRS start date.** Before `fbi_get_nibrs_breakdown` at agency scope, read `is_nibrs` and `nibrs_start_date` from `fbi_search_agencies` and request a window after that date. `no_data` there does not by itself mean no incidents: CDE answers the same for months the agency has not submitted, often the latest ones. Run `fbi_get_arrests` with `include_monthly` for the same agency and window; only when every month has a `participated_population` does `no_data` mean it recorded no incidents of that offense.
3. **Null is unknown, never zero.** A null count (`—` or `Unavailable` in the text) means CDE sent no value: never add it as 0 or report it as "none."
   - In `fbi_get_crime_estimates`, current-year months past CDE's latest data are null.
   - A monthly row whose `participated_population` is null had no reporting agency, so its counts are not reported zeros.
   - In `fbi_get_leoka`, zero is a reported count and null is unavailable.
4. **Check reporting coverage before comparing periods.** Counts grow as more agencies report, so a change across years or months can be a change in coverage. Before stating a trend, read `population_coverage_percent` and `participated_population` for each period: on every `fbi_get_crime_estimates` row, and on the monthly rows `include_monthly` adds to `fbi_get_hate_crimes`, `fbi_get_arrests`, and `fbi_get_nibrs_breakdown`. Compare the per-100,000 rates (per participating population) between periods of similar coverage, and state the coverage. National NIBRS aggravated assault (`13A`) offenses more than doubled from 2019 to 2023 while coverage rose from about half to about 85% of the population; the rate rose about 30%.
5. **The latest months are partial.** The months just before `max_data_date` are still being reported: coverage drops, counts drop with it, and the rates drop too, so a fall there is not a decline. End a trend at the last month whose coverage matches the months before it.
6. **Rates are monthly.** Each per-100,000 rate on a `fbi_get_crime_estimates` row or a monthly row is the rate for that one month. A year's rate is the sum of its twelve monthly rates (national violent crime in 2025: about 330 per 100,000), never one month's rate or their average.
7. **Take a headline total from the right map.** The totals tools return several category maps over the same records, each tallied separately.
   - Arrests: the total is the sum of `offense_category` (the same as `offense_name`, `offense_breakdown`, and the monthly `arrest_count`); `arrestee_sex` and `arrestee_race` sum lower. A code inside a multi-code category is a fraction of it, and with that code even the `offense_category` row shows only the code's arrests: nationally in 2023, code `150` counted about 55,000 of some 918,000 Drug/Narcotic Offenses arrests.
   - Hate crimes: incidents are the sum of `incident_section.bias`, where an incident with several motivations counts once under Multiple Bias; it equals the sum of `bias_category` and of the monthly `incident_count`. Offenses are the sum of `bias_section.offense_type` (the monthly `offense_count`); the other `bias_section` maps each count on their own basis. With a bias code, incidents include every multiple-bias incident involving that motivation, so results for different codes overlap: never add them for a total.
   - NIBRS: the offense count is the monthly `actual_count` from `include_monthly`; the victim and offender maps count victims and offenders, not offenses.
   - Staffing: CDE sends no total. All employees is the four counts added, sworn officers the two officer counts; quote `employees_per_1000` as CDE publishes it.
8. **Staffing years publish late.** In `fbi_get_police_employees` the latest staffing year is the last row with values, not the current year; `max_data_date` is CDE's latest UCR data month, not the latest staffing year. `population_coverage_percent` is always null at agency scope, where CDE sends none.
9. **One measure per figure.** `fbi_get_crime_estimates` counts offenses, `fbi_get_arrests` counts arrests, and `fbi_get_nibrs_breakdown` counts NIBRS-reported offenses, victims, and offenders for one offense. They measure different things; name the measure beside each number.
10. **LEOKA `totals` counts felonious killings only.** For officers killed, read `deaths_by_year` (Felonious and Accidental, `period: "ytd"` only; the current year's entry is year-to-date) or `deaths_by_region`, and add both types for all deaths. `totals` is CDE's raw year-to-date block, returned for monthly requests too: its `total_officers` matches the year's Felonious entry, so it leaves out accidental deaths, and its `dod`/`doi` split has no defined meaning.

## Workflows

**Per-year values from one call.** `fbi_get_hate_crimes`, `fbi_get_arrests`, and `fbi_get_nibrs_breakdown` sum the whole window. With `include_monthly`, the arrest, incident, and offense counts in the month rows add up to the window's totals, so one call over several years, summed by year, replaces a call per year and carries the coverage Gate 4 needs. `fbi_get_crime_estimates` and `fbi_get_police_employees` already return one row per month or year.
