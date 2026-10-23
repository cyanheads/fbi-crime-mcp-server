/**
 * @fileoverview Validated FBI CDE response shapes, including sparse count records.
 * @module services/fbi-api/types
 */

import { z } from '@cyanheads/mcp-ts-core';

/** Category or month key to count; null means unavailable, never zero. */
export const CountMapSchema = z.record(z.string(), z.number().nullable());
/** Dimension or killing type to category counts; null subgroups stay explicit. */
export const NestedCountMapSchema = z.record(z.string(), CountMapSchema.nullable());
/** Killing type to year to month counts, including comparison years. */
export const MonthlyCountMapSchema = z.record(z.string(), NestedCountMapSchema.nullable());

/** Raw incidents_victim_officer_totals_ytd block, returned by both LEOKA periods. */
export const FbiLeokaTotalsSchema = z.object({
  total_officers: z
    .number()
    .nullable()
    .optional()
    .describe(
      'CDE YTD total officers from incidents_victim_officer_totals_ytd; not a combined fatality or requested-month count.',
    ),
  total_incidents: z
    .number()
    .nullable()
    .optional()
    .describe(
      'CDE YTD total incidents from incidents_victim_officer_totals_ytd; not a combined fatality or requested-month count.',
    ),
  total_officers_dod: z
    .number()
    .nullable()
    .optional()
    .describe('Raw total_officers_dod from the CDE YTD block; dod interpretation is unspecified.'),
  total_officers_doi: z
    .number()
    .nullable()
    .optional()
    .describe('Raw total_officers_doi from the CDE YTD block; doi interpretation is unspecified.'),
  total_incidents_dod: z
    .number()
    .nullable()
    .optional()
    .describe('Raw total_incidents_dod from the CDE YTD block; dod interpretation is unspecified.'),
  total_incidents_doi: z
    .number()
    .nullable()
    .optional()
    .describe('Raw total_incidents_doi from the CDE YTD block; doi interpretation is unspecified.'),
});

/** LEOKA chart_data shared by the YTD and monthly envelopes. */
export const FbiLeokaChartSchema = z.object({
  incidents_victim_officer_totals_ytd: FbiLeokaTotalsSchema.nullish(),
  body_armor_worn: CountMapSchema.nullish(),
  lighting_conditions: CountMapSchema.nullish(),
  location_of_attack: CountMapSchema.nullish(),
  offender_demographic: NestedCountMapSchema.nullish(),
  offender_previously_known_to_agency: CountMapSchema.nullish(),
  offender_prior_mental_illness: CountMapSchema.nullish(),
  offender_prior_relationship: CountMapSchema.nullish(),
  officer_activity: CountMapSchema.nullish(),
  officer_circumstances_time_of_attack: CountMapSchema.nullish(),
  officer_death_by_geographic_region: NestedCountMapSchema.nullish(),
  officer_death_by_month: MonthlyCountMapSchema.nullish(),
  officer_death_by_time_of_day: NestedCountMapSchema.nullish(),
  officer_death_by_year: NestedCountMapSchema.nullish(),
  officer_demographic: NestedCountMapSchema.nullish(),
  officer_incident_type: CountMapSchema.nullish(),
  officer_type_of_assignment: CountMapSchema.nullish(),
  weapons: CountMapSchema.nullish(),
  weather_conditions: CountMapSchema.nullish(),
});

/** Validated LEOKA chart, before omitted/null sections are removed from tool output. */
export type FbiLeokaChartData = z.infer<typeof FbiLeokaChartSchema>;

/**
 * Summarized rates and actuals use entity labels then MM-YYYY month keys.
 * Actuals identify the scoped entity. Rates, populations, and the coverage tooltip also carry
 * comparison entities ahead of it (an agency's state and the United States, a state's United
 * States), with rates per 100,000 participating population and no comparison actuals.
 */
export const FbiSummarizedResponseSchema = z.object({
  populations: z
    .object({
      population: NestedCountMapSchema.nullish(),
      participated_population: NestedCountMapSchema.nullish(),
    })
    .nullish(),
  tooltips: z
    .object({
      'Percent of Population Coverage': NestedCountMapSchema.nullish(),
    })
    .nullish(),
  cde_properties: z
    .object({
      max_data_date: z.record(z.string(), z.string()).optional(),
      last_refresh_date: z.record(z.string(), z.string()).optional(),
    })
    .nullish(),
  offenses: z
    .object({
      rates: NestedCountMapSchema.nullish(),
      actuals: NestedCountMapSchema.nullish(),
    })
    .nullish(),
});

/** Summarized data with nullable scoped actuals and rates represented explicitly. */
export type FbiSummarizedResponse = z.infer<typeof FbiSummarizedResponseSchema>;

/**
 * Scope and MM-YYYY window for a CDE `{endpoint}/{scope}/{selector}` request. The identifier is
 * sent as given, so callers pass it uppercased.
 */
export type CdeScopedWindow = { from: string; to: string } & (
  | { scope: 'national' }
  | { scope: 'state'; stateAbbr: string }
  | { scope: 'agency'; ori: string }
);

/** `last_refresh_date` / `max_data_date` maps CDE keys by source system (`UCR`). */
const CdeDateMapSchema = z.record(z.string(), z.string());

/** The `cde_properties` envelope arrest and NIBRS totals carry. */
const CdePropertiesSchema = z
  .object({
    max_data_date: CdeDateMapSchema.nullish(),
    last_refresh_date: CdeDateMapSchema.nullish(),
  })
  .nullish();

/**
 * `GET /hate-crime/{scope}/{bias}?type=totals`: category counts summed over the window. Every
 * captured payload carries the same dimensions at every scope, bias, and year (286 cells), so a
 * missing or null dimension is malformed. An unknown ORI or bias code returns the same shape with
 * every count zero.
 */
export const FbiHateCrimeTotalsSchema = z.object({
  incident_section: z.object({ bias: CountMapSchema, bias_category: CountMapSchema }),
  bias_section: z.object({
    offense_type: CountMapSchema,
    location_type: CountMapSchema,
    offender_race: CountMapSchema,
    offender_ethnicity: CountMapSchema,
    judicial_district: CountMapSchema,
  }),
  last_refresh_date: CdeDateMapSchema.nullish(),
});

export type FbiHateCrimeTotals = z.infer<typeof FbiHateCrimeTotalsSchema>;

/**
 * `GET /arrest/{scope}/{offense}?type=totals`: seven category groups summed over the window (175
 * cells in every captured payload). The demographic groups do not sum to the offense total. An
 * unknown ORI or offense code returns the same shape with every count zero.
 */
export const FbiArrestTotalsSchema = z.object({
  'Offense Name': CountMapSchema,
  'Offense Category': CountMapSchema,
  'Offense Breakdown': CountMapSchema,
  'Arrestee Sex': CountMapSchema,
  'Arrestee Race': CountMapSchema,
  'Male Arrests By Age': CountMapSchema,
  'Female Arrests By Age': CountMapSchema,
  cde_properties: CdePropertiesSchema,
});

export type FbiArrestTotals = z.infer<typeof FbiArrestTotalsSchema>;

/**
 * `GET /nibrs/{scope}/{offense}?type=totals`: victim, offender, and offense category counts summed
 * over the window (261 cells in every captured payload; dimensions do not sum to one total). An
 * unknown ORI or offense code, a window with no NIBRS data, or an offense with no reported
 * incidents in the window returns the same shape with every count null.
 */
export const FbiNibrsTotalsSchema = z.object({
  victim: z.object({
    age: CountMapSchema,
    sex: CountMapSchema,
    race: CountMapSchema,
    location: CountMapSchema,
    ethnicity: CountMapSchema,
    relationship: CountMapSchema,
  }),
  offender: z.object({
    age: CountMapSchema,
    sex: CountMapSchema,
    race: CountMapSchema,
    ethnicity: CountMapSchema,
  }),
  offense: z.object({ weapons: CountMapSchema, related_offenses: CountMapSchema }),
  cde_properties: CdePropertiesSchema,
});

export type FbiNibrsTotals = z.infer<typeof FbiNibrsTotalsSchema>;

/**
 * One agency in the CDE state directory. Every captured record carries these fields;
 * `nibrs_start_date` is null exactly when `is_nibrs` is false. Coordinates and the
 * per-state constants (`state_abbr`, `state_name`) are dropped.
 */
export const FbiDirectoryAgencySchema = z.object({
  ori: z.string(),
  agency_name: z.string(),
  agency_type_name: z.string(),
  /** Comma-separated county list, e.g. `BEXAR, MEDINA`; `NOT SPECIFIED` for statewide agencies. */
  counties: z.string(),
  is_nibrs: z.boolean(),
  nibrs_start_date: z.string().nullish(),
});

export type FbiDirectoryAgency = z.infer<typeof FbiDirectoryAgencySchema>;

/**
 * `GET /agency/byStateAbbr/{STATE}` answers HTTP 200 in two shapes: agencies grouped
 * under county-string keys (a multi-county agency appears once, under its combined key),
 * or, for a code CDE has no directory for (including any lowercase code), an envelope
 * whose `counties` is null.
 */
export const FbiAgencyDirectoryResponseSchema = z.union([
  z.object({ cde_agencies_query: z.object({ counties: z.null() }) }),
  z.record(z.string(), z.array(FbiDirectoryAgencySchema)),
]);
