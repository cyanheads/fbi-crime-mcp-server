/**
 * @fileoverview Shared types for FBI Crime Data Explorer API responses.
 * Raw upstream shapes — fields optional to preserve upstream sparsity.
 * @module services/fbi-api/types
 */

/** Pagination envelope returned by all list endpoints. */
export interface FbiPagination {
  count?: number;
  page?: number;
  pages?: number;
  per_page?: number;
}

/** Agency search / list response. */
export interface FbiAgency {
  agency_name?: string;
  agency_type_name?: string;
  city_name?: string;
  county_name?: string;
  female_civilian?: number | null;
  female_officer?: number | null;
  male_civilian?: number | null;
  // Staffing (from detailed profile)
  male_officer?: number | null;
  nibrs?: boolean;
  nibrs_start_date?: string | null;
  ori?: string;
  population?: number | null;
  population_group_code?: string;
  population_group_desc?: string;
  state_abbr?: string;
  state_name?: string;
  total_civilian?: number | null;
  total_officers?: number | null;
}

/** UCR national/state crime estimate row. */
export interface FbiEstimateRow {
  aggravated_assault?: number | null;
  burglary?: number | null;
  homicide?: number | null;
  larceny?: number | null;
  motor_vehicle_theft?: number | null;
  population?: number | null;
  property_crime?: number | null;
  rape_legacy?: number | null;
  rape_revised?: number | null;
  robbery?: number | null;
  state_abbr?: string;
  state_name?: string;
  violent_crime?: number | null;
  year?: number;
}

/** Agency offense count row. */
export interface FbiAgencyOffenseRow {
  actual?: number | null;
  agency_name?: string;
  cleared?: number | null;
  offense?: string;
  ori?: string;
  reported?: number | null;
  state_abbr?: string;
  year?: number;
}

/** NIBRS breakdown row (offenders, victims, offenses). */
export interface FbiNibrsRow {
  key?: string;
  total?: number | null;
  value?: number | null;
}

/** Arrest row. */
export interface FbiArrestRow {
  asian?: number | null;
  black?: number | null;
  female_adult?: number | null;
  female_juv?: number | null;
  male_adult?: number | null;
  male_juv?: number | null;
  native_american?: number | null;
  offense?: string;
  pacific_islander?: number | null;
  total?: number | null;
  white?: number | null;
  year?: number;
}

/** Hate crime bias row. */
export interface FbiHateCrimeRow {
  bias_motivation?: string;
  data_year?: number;
  // When cross_offense=true, additional offense breakdown may appear
  offense_name?: string;
  total_individual_incidents?: number | null;
  total_known_offenders?: number | null;
  total_offenses?: number | null;
  total_victims?: number | null;
}

/** Participation row. */
export interface FbiParticipationRow {
  agency_count?: number | null;
  agency_name?: string;
  covered_population?: number | null;
  months_reported?: number | null;
  nibrs?: boolean;
  nibrs_participating?: number | null;
  nibrs_population?: number | null;
  nibrs_start_date?: string | null;
  // Agency-level variant
  ori?: string;
  state_abbr?: string;
  state_name?: string;
  total_population?: number | null;
  year?: number;
}

/** Human trafficking row. */
export interface FbiHumanTraffickingRow {
  actual_commercial_sex_acts?: number | null;
  actual_involuntary_servitude?: number | null;
  agency_name?: string;
  cleared_commercial_sex_acts?: number | null;
  cleared_involuntary_servitude?: number | null;
  data_year?: number;
  ori?: string;
  state_abbr?: string;
}

/** LEOKA row. */
export interface FbiLeokaRow {
  firearm?: number | null;
  hands?: number | null;
  knife?: number | null;
  month?: number | null;
  other?: number | null;
  total_accident?: number | null;
  total_assaults?: number | null;
  total_felony?: number | null;
  year?: number;
}

/** Arson row. */
export interface FbiArsonRow {
  inhabited_structures?: number | null;
  motor_vehicles?: number | null;
  other?: number | null;
  other_structures?: number | null;
  state_abbr?: string;
  total_actual?: number | null;
  total_cleared?: number | null;
  uninhabited_structures?: number | null;
  year?: number;
}

/** Reference code table row. */
export interface FbiCodeTableRow {
  code?: string;
  description?: string;
  key?: string;
  name?: string;
  value?: string;
}
