/**
 * @fileoverview Shared types for FBI Crime Data Explorer API responses.
 * Reflects the actual CDE API as of 2026-05-25.
 * UCR legacy endpoints are decommissioned — only CDE endpoints remain active.
 * @module services/fbi-api/types
 */

/**
 * LEOKA chart data returned by /cde/leoka/ytd and /cde/leoka/monthly.
 * Both endpoints wrap this inside:
 *   ytd:     [{ leoka_chart_ytd:     { data: { chart_data: FbiLeokaChartData } } }]
 *   monthly: [{ leoka_chart_monthly: { data: { chart_data: FbiLeokaChartData } } }]
 */
export interface FbiLeokaChartData {
  /** Body armor worn status. { "Yes": 3, "No": 55, ... } */
  body_armor_worn?: Record<string, number>;
  /** Officers killed/assaulted totals for the period. */
  incidents_victim_officer_totals_ytd?: {
    /** Total officers killed (feloniously + accidentally). */
    total_officers?: number;
    /** Total incidents (one or more officers may be killed per incident). */
    total_incidents?: number;
    /** Officers killed due to a felonious act. */
    total_officers_dod?: number;
    /** Officers killed due to an accident. */
    total_officers_doi?: number;
    /** Incidents involving a felonious killing. */
    total_incidents_dod?: number;
    /** Incidents involving an accidental killing. */
    total_incidents_doi?: number;
  };
  /** Lighting conditions. { "Daylight": 30, ... } */
  lighting_conditions?: Record<string, number>;
  /** Location of attack breakdown. { "Ambush": 5, ... } */
  location_of_attack?: Record<string, number>;
  /** Offender demographic breakdown. */
  offender_demographic?: Record<string, unknown>;
  /** Whether offender was previously known to agency. */
  offender_previously_known_to_agency?: Record<string, number>;
  /** Prior mental illness status of offender. */
  offender_prior_mental_illness?: Record<string, number>;
  /** Prior relationship of offender to officer. */
  offender_prior_relationship?: Record<string, number>;
  /** Officer activity at time of incident. { "Patrolling": 17, ... } */
  officer_activity?: Record<string, number>;
  /** Circumstances at time of attack. */
  officer_circumstances_time_of_attack?: Record<string, number>;
  /** Geographic region breakdown. { "South": 25, ... } */
  officer_death_by_geographic_region?: Record<string, number>;
  /** Officer felonious/accidental deaths by month within each year. { "Felonious": { "2022": { "Jan": 4, ... } }, ... } */
  officer_death_by_month?: Record<string, Record<string, Record<string, number>>>;
  /** Time of day breakdown. */
  officer_death_by_time_of_day?: Record<string, number>;
  /** Officer felonious/accidental deaths by calendar year. { "Felonious": { "2022": 61, ... }, "Accidental": { "2022": 57, ... } } */
  officer_death_by_year?: Record<string, Record<string, number>>;
  /** Officer demographic breakdown. */
  officer_demographic?: Record<string, unknown>;
  /** Officer incident type breakdown. { "Fall": 2, ... } */
  officer_incident_type?: Record<string, number>;
  /** Officer type of assignment. */
  officer_type_of_assignment?: Record<string, number>;
  /** Weapon counts for the period. { "Handguns": 34, "Rifles": 10, ... } */
  weapons?: Record<string, number>;
  /** Weather conditions. { "Clear": 40, ... } */
  weather_conditions?: Record<string, number>;
}

/**
 * Summarized offense response from /cde/summarized/{scope}/{offense}.
 * Returns monthly rates and actuals for the requested date range.
 * Keys in rates/actuals use the format "MM-YYYY" (e.g. "01-2022").
 */
export interface FbiSummarizedResponse {
  /** API metadata: max_data_date, last_refresh_date. */
  cde_properties?: {
    max_data_date?: Record<string, string>;
    last_refresh_date?: Record<string, string>;
  };
  offenses: {
    /** Per-100k rates by location and month. Keys: "United States Offenses", "California Offenses", "Agency Name Offenses", clearance equivalents. */
    rates: Record<string, Record<string, number>>;
    /** Absolute offense/clearance counts by location and month. Same key structure as rates. */
    actuals: Record<string, Record<string, number>>;
  };
  /** Population data by location and month. */
  populations?: {
    population?: Record<string, Record<string, number>>;
  };
  /** Tooltip metadata (internal CDE display use). */
  tooltips?: Record<string, unknown>;
}
