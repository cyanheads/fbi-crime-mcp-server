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
 * Actuals identify the scoped entity; rates may also contain comparison entities.
 */
export const FbiSummarizedResponseSchema = z.object({
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
