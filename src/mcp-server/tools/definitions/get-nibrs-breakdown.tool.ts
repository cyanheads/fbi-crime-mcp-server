/**
 * @fileoverview FBI CDE NIBRS breakdown tool: victim, offender, and offense category counts for one
 * NIBRS offense, summed over a month window at national, state, or agency scope.
 * @module mcp-server/tools/definitions/get-nibrs-breakdown.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  type ResolvedScopedRange,
  resolveScopedRange,
  scopedRangeFields,
} from '@/mcp-server/tools/cde-scoped-range.js';
import {
  allCountsNull,
  codeListing,
  countMap,
  countTable,
  escapeMarkdown,
  scopeEcho,
  scopeEchoFields,
  scopeHeading,
  scopeLine,
} from '@/mcp-server/tools/cde-totals.js';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

/** First year /nibrs/ serves data; 1990 answers with every count null. */
const FLOOR_YEAR = 1991;

/**
 * CDE NIBRS offense codes, each probed live nationally (2015–2025) to return data. CDE's spec
 * also lists `23*` (Not Specified), which returns every count null, the same payload as an
 * unlisted code or an unknown ORI, so it is left out and the enum is enforced locally.
 */
const OFFENSE_LABELS = {
  '100': 'Kidnapping/Abduction',
  '101': 'Treason',
  '103': 'Espionage',
  '120': 'Robbery',
  '200': 'Arson',
  '210': 'Extortion/Blackmail',
  '220': 'Burglary/Breaking & Entering',
  '240': 'Motor Vehicle Theft',
  '250': 'Counterfeiting/Forgery',
  '270': 'Embezzlement',
  '280': 'Stolen Property Offenses',
  '290': 'Destruction/Damage/Vandalism of Property',
  '360': 'Failure to Register as a Sex Offender',
  '370': 'Pornography/Obscene Material',
  '510': 'Bribery',
  '520': 'Weapon Law Violations',
  '521': 'Violation of National Firearm Act of 1934',
  '522': 'Weapons of Mass Destruction',
  '526': 'Explosives Violation',
  '620': 'Wildlife Trafficking',
  '720': 'Animal Cruelty',
  '09A': 'Murder and Nonnegligent Manslaughter',
  '09B': 'Negligent Manslaughter',
  '09C': 'Justifiable Homicide',
  '11A': 'Rape',
  '11B': 'Sodomy',
  '11C': 'Sexual Assault With An Object',
  '11D': 'Criminal Sexual Contact',
  '13A': 'Aggravated Assault',
  '13B': 'Simple Assault',
  '13C': 'Intimidation',
  '23A': 'Pocket-picking',
  '23B': 'Purse-snatching',
  '23C': 'Shoplifting',
  '23D': 'Theft From Building',
  '23E': 'Theft From Coin-Operated Machine or Device',
  '23F': 'Theft From Motor Vehicle',
  '23G': 'Theft of Motor Vehicle Parts or Accessories',
  '23H': 'All Other Larceny',
  '26A': 'False Pretenses/Swindle/Confidence Game',
  '26B': 'Credit Card/Automated Teller Machine Fraud',
  '26C': 'Impersonation',
  '26D': 'Welfare Fraud',
  '26E': 'Wire Fraud',
  '26F': 'Identity Theft',
  '26G': 'Hacking/Computer Invasion',
  '26H': 'Money Laundering',
  '30A': 'Illegal Entry into the United States',
  '30B': 'False Citizenship',
  '30C': 'Smuggling Aliens',
  '30D': 'Re-entry after Deportation',
  '35A': 'Drug/Narcotic Violations',
  '35B': 'Drug Equipment Violations',
  '36A': 'Incest',
  '36B': 'Statutory Rape',
  '39A': 'Betting/Wagering',
  '39B': 'Operating/Promoting/Assisting Gambling',
  '39C': 'Gambling Equipment Violation',
  '39D': 'Sports Tampering',
  '40A': 'Prostitution',
  '40B': 'Assisting or Promoting Prostitution',
  '40C': 'Purchasing Prostitution',
  '49A': 'Harboring Escapee/Concealing from Arrest',
  '49B': 'Flight to Avoid Prosecution',
  '49C': 'Flight to Avoid Deportation',
  '58A': 'Import Violations',
  '58B': 'Export Violations',
  '61A': 'Federal Liquor Offenses',
  '61B': 'Federal Tobacco Offenses',
  '64A': 'Human Trafficking, Commercial Sex Acts',
  '64B': 'Human Trafficking, Involuntary Servitude',
} as const;

type OffenseCode = keyof typeof OFFENSE_LABELS;
const OFFENSE_VALUES = Object.keys(OFFENSE_LABELS) as [OffenseCode, ...OffenseCode[]];

const { scope: scopeField, ...rangeFields } = scopedRangeFields(FLOOR_YEAR);

/**
 * Recovery for an all-null payload. CDE sends all nulls for an unrecognized identifier and for an
 * offense with no reported incidents in the window, so the hint covers both: identifier first.
 */
function noDataHint(range: ResolvedScopedRange): string {
  if (range.scope === 'agency')
    return 'Confirm the ORI with fbi_search_agencies, which also shows whether the agency reports to NIBRS (is_nibrs) and since when (nibrs_start_date). If it reported throughout this window, it recorded no incidents of this offense; otherwise request a window after that date.';
  if (range.scope === 'state')
    return 'Confirm state_abbr is a US state or territory abbreviation. A valid state with no reported incidents of this offense in the window also returns no values; try a later or wider window.';
  return 'No incidents of this offense were reported to NIBRS nationally in the requested window; try a later or wider window.';
}

export const fbiGetNibrsBreakdown = tool('fbi_get_nibrs_breakdown', {
  title: 'FBI Get NIBRS Breakdown',
  description: `NIBRS incident breakdowns reported to FBI CDE for one offense, for the nation, a state, or an agency, summed over a month window from January ${FLOOR_YEAR} through the current year. Returns victim counts by age, sex, race, location, ethnicity, and relationship to the offender; offender counts by age, sex, race, and ethnicity; and offense counts by weapon and related offense, with every category CDE reports, zeros included. Each dimension is tallied separately and their sums can differ, so no dimension stands in for another's total. offense is required (codes are listed on the field). National scope omits identifiers; state requires only state_abbr; agency requires only ori (look it up with fbi_search_agencies). When CDE has no value for any category, as for an unrecognized state or ORI, a window with no NIBRS data, or an offense with no reported incidents in the window, the call fails with no_data.`,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  errors: [
    {
      reason: 'scope_param_missing',
      code: JsonRpcErrorCode.ValidationError,
      when: 'scope is "state" but state_abbr is missing, or scope is "agency" but ori is missing.',
      recovery:
        'Provide state_abbr for state scope, or ori (9-character ORI code) for agency scope.',
      thrownBy: 'service',
    },
    {
      reason: 'scope_param_incompatible',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Identifiers are supplied for a scope that does not apply them.',
      recovery:
        'For national scope omit state_abbr and ori; for state provide only state_abbr; for agency provide only ori.',
      thrownBy: 'service',
    },
    {
      reason: 'year_out_of_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'from_year or to_year is after the current UTC year.',
      recovery: `Use from_year and to_year from ${FLOOR_YEAR} through the current year.`,
      thrownBy: 'service',
    },
    {
      reason: 'invalid_date_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The complete starting year/month is later than the ending year/month.',
      recovery:
        'Correct from_year/from_month and to_year/to_month so the start is no later than the end.',
      thrownBy: 'service',
    },
    {
      reason: 'no_data',
      code: JsonRpcErrorCode.NotFound,
      when: 'CDE returned no value for any category: an unrecognized state or ORI, no NIBRS data for the window, or no reported incidents of the offense in the window.',
      recovery:
        'Confirm the identifier first (the ORI and its NIBRS start date with fbi_search_agencies, or state_abbr), then try a later or wider window.',
    },
  ],

  input: z.object({
    scope: scopeField,
    offense: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.toUpperCase() : value),
        z.enum(OFFENSE_VALUES),
      )
      .describe(
        `NIBRS offense code to break down (required; case-insensitive). Codes: ${codeListing(OFFENSE_LABELS)}.`,
      ),
    ...rangeFields,
  }),

  output: z.object({
    ...scopeEchoFields,
    offense: z.enum(OFFENSE_VALUES).describe('NIBRS offense code applied.'),
    offense_label: z.string().describe('CDE label for the applied offense code.'),
    victim: z
      .object({
        age: countMap('Victims by age group.'),
        sex: countMap('Victims by sex.'),
        race: countMap('Victims by race.'),
        location: countMap('Victims by location type.'),
        ethnicity: countMap('Victims by ethnicity.'),
        relationship: countMap('Victims by relationship to the offender.'),
      })
      .describe('Victim counts summed over the window.'),
    offender: z
      .object({
        age: countMap('Offenders by age group.'),
        sex: countMap('Offenders by sex.'),
        race: countMap('Offenders by race.'),
        ethnicity: countMap('Offenders by ethnicity.'),
      })
      .describe('Offender counts summed over the window.'),
    offense_details: z
      .object({
        weapons: countMap('Counts by weapon type.'),
        related_offenses: countMap('Counts by related offense, as CDE labels them.'),
      })
      .describe("CDE's offense section (weapons and related offenses) summed over the window."),
    data_last_updated: z
      .string()
      .optional()
      .describe('Date CDE last refreshed NIBRS data; absent when CDE omits it.'),
    max_data_date: z
      .string()
      .optional()
      .describe('Latest data month CDE reports (MM/YYYY); absent when CDE omits it.'),
  }),

  async handler(input, ctx) {
    ctx.log.info('fbi_get_nibrs_breakdown', {
      scope: input.scope,
      offense: input.offense,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });
    const range = resolveScopedRange(input, FLOOR_YEAR, ctx);
    const data = await getFbiApiService().getNibrsTotals(range, input.offense, ctx);
    const { victim, offender, offense } = data;
    const maxDataDate = data.cde_properties?.max_data_date?.UCR;

    if (
      allCountsNull([
        ...Object.values(victim),
        ...Object.values(offender),
        ...Object.values(offense),
      ])
    ) {
      const where =
        range.scope === 'agency'
          ? `agency ${range.ori}`
          : range.scope === 'state'
            ? `state ${range.stateAbbr}`
            : 'the nation';
      throw ctx.fail(
        'no_data',
        `CDE has no NIBRS data for offense ${input.offense} (${OFFENSE_LABELS[input.offense]}) for ${where}, ${range.from} to ${range.to}${maxDataDate ? `; its data runs through ${maxDataDate}` : ''}.`,
        { recovery: { hint: noDataHint(range) } },
      );
    }
    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;
    return {
      ...scopeEcho(range),
      offense: input.offense,
      offense_label: OFFENSE_LABELS[input.offense],
      victim,
      offender,
      offense_details: offense,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
      ...(maxDataDate && { max_data_date: maxDataDate }),
    };
  },

  format: (result) => {
    const { victim, offender, offense_details: details } = result;
    const lines = [
      `## FBI NIBRS Breakdown — ${scopeHeading(result)}`,
      scopeLine(result),
      `**Offense:** ${result.offense} (${escapeMarkdown(result.offense_label)}) | **Range:** ${result.from} → ${result.to}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    if (result.max_data_date) lines.push(`**Max data date:** ${result.max_data_date}`);
    lines.push(
      '',
      'Counts are summed over the window; — means CDE sent no value. Each dimension is tallied separately and their sums can differ; they do not sum to one total.',
      ...countTable('Victim age', victim.age),
      ...countTable('Victim sex', victim.sex),
      ...countTable('Victim race', victim.race),
      ...countTable('Victim location', victim.location),
      ...countTable('Victim ethnicity', victim.ethnicity),
      ...countTable('Victim relationship to offender', victim.relationship),
      ...countTable('Offender age', offender.age),
      ...countTable('Offender sex', offender.sex),
      ...countTable('Offender race', offender.race),
      ...countTable('Offender ethnicity', offender.ethnicity),
      ...countTable('Weapons', details.weapons),
      ...countTable('Related offenses', details.related_offenses),
    );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
