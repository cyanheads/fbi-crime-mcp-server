/**
 * @fileoverview FBI CDE arrest totals tool: arrests by offense, arrestee sex and race, and age,
 * summed over a month window at national, state, or agency scope.
 * @module mcp-server/tools/definitions/get-arrests.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { resolveScopedRange, scopedRangeFields } from '@/mcp-server/tools/cde-scoped-range.js';
import {
  allCountsZero,
  codeListing,
  countMap,
  countTable,
  escapeMarkdown,
  scopeEcho,
  scopeEchoFields,
  scopeHeading,
  scopeLine,
  zeroCountsNotice,
} from '@/mcp-server/tools/cde-totals.js';
import { getFbiApiService } from '@/services/fbi-api/fbi-api-service.js';

/** First year /arrest/ serves; CDE rejects earlier windows. */
const FLOOR_YEAR = 1985;

/**
 * CDE arrest offense codes from CDE's API spec, each probed live to return its offense. Word
 * slugs (`robbery`) are rejected upstream; an unlisted numeric code returns HTTP 200 with every
 * count zero, indistinguishable from a real zero, so the enum is enforced locally. The spec's
 * `23` (Rape - Not Specified) is left out: it returns that same all-zero payload nationally for
 * 1985 through 2025.
 */
const OFFENSE_LABELS = {
  '11': 'Murder and Nonnegligent Homicide',
  '12': 'Manslaughter by Negligence',
  '20': 'Rape - Not Specified (Legacy)',
  '30': 'Robbery',
  '50': 'Assault - Not Specified',
  '55': 'Simple Assault',
  '60': 'Burglary',
  '70': 'Larceny - Theft',
  '90': 'Motor Vehicle Theft',
  '101': 'Commercial Sex Acts',
  '102': 'Involuntary Servitude',
  '110': 'Arson',
  '140': 'Prostitution and Commercialized Vice',
  '141': 'Prostitution and Commercialized Vice - Prostitution',
  '142': 'Prostitution and Commercialized Vice - Assisting or Promoting Prostitution',
  '143': 'Prostitution and Commercialized Vice - Purchasing Prostitution',
  '150': 'Drug Abuse Violations',
  '151': 'Drug Sale/Manufacturing (Unspecified)',
  '152': 'Drug Sale/Manufacturing - Opium or Cocaine or Their Derivatives',
  '153': 'Drug Sale/Manufacturing - Marijuana',
  '154': 'Drug Sale/Manufacturing - Synthetic Narcotics',
  '155': 'Drug Sale/Manufacturing - Other - Dangerous Nonnarcotic Drugs',
  '156': 'Drug Possession (Unspecified)',
  '157': 'Drug Possession - Opium or Cocaine or Their Derivatives',
  '158': 'Drug Possession - Marijuana',
  '159': 'Drug Possession - Synthetic Narcotics',
  '160': 'Drug Possession - Other - Dangerous Nonnarcotic Drugs',
  '170': 'Gambling (Unspecified)',
  '171': 'Gambling - Bookmaking (Horse and Sport Book)',
  '172': 'Gambling - Numbers and Lottery',
  '173': 'Gambling - All Other Gambling',
  '180': 'Forgery and Counterfeiting',
  '190': 'Fraud',
  '200': 'Embezzlement',
  '210': 'Stolen Property: Buying, Receiving, Possessing',
  '220': 'Vandalism',
  '230': 'Weapons: Carrying, Possessing, Etc.',
  '240': 'Sex Offenses (Except Rape, and Prostitution and Commercialized Vice)',
  '250': 'Offenses Against the Family and Children',
  '260': 'Driving Under the Influence',
  '270': 'Liquor Law Violations',
  '280': 'Drunkenness',
  '290': 'Disorderly Conduct',
  '300': 'Vagrancy',
  '310': 'All Other Offenses (Except Traffic)',
  '330': 'Curfew and Loitering Law Violations',
} as const;

type OffenseCode = keyof typeof OFFENSE_LABELS;
const OFFENSE_VALUES: ['all', ...OffenseCode[]] = [
  'all',
  ...(Object.keys(OFFENSE_LABELS) as OffenseCode[]),
];

const { scope: scopeField, ...rangeFields } = scopedRangeFields(FLOOR_YEAR);

export const fbiGetArrests = tool('fbi_get_arrests', {
  title: 'FBI Get Arrests',
  description: `Arrest counts reported to FBI CDE for the nation, a state, or an agency, summed over a month window from January ${FLOOR_YEAR} through the current year. Returns arrests by offense name, offense category, and detailed offense breakdown, by arrestee sex and race, and by age group for male and female arrestees, with every category CDE reports, zeros included. Each grouping is tallied separately and their sums can differ (arrestee sex and race often total less than the offense groupings), so no grouping stands in for another's total. Narrow to one offense with offense. National scope omits identifiers; state requires only state_abbr; agency requires only ori (look it up with fbi_search_agencies). CDE returns zeros both when nothing was reported and when it does not recognize a state or ORI.`,
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
  ],

  input: z.object({
    scope: scopeField,
    offense: z
      .enum(OFFENSE_VALUES)
      .default('all')
      .describe(
        `CDE arrest offense code to narrow the counts to, or all (default). Codes: ${codeListing(OFFENSE_LABELS)}.`,
      ),
    ...rangeFields,
  }),

  output: z.object({
    ...scopeEchoFields,
    offense: z.enum(OFFENSE_VALUES).describe('Arrest offense code applied, or all.'),
    offense_label: z
      .string()
      .describe('CDE label for the applied offense code; "All offenses" for all.'),
    offense_name: countMap('Arrests by offense name.'),
    offense_category: countMap('Arrests by offense category.'),
    offense_breakdown: countMap('Arrests by detailed offense breakdown.'),
    arrestee_sex: countMap('Arrests by arrestee sex.'),
    arrestee_race: countMap('Arrests by arrestee race.'),
    male_arrests_by_age: countMap('Arrests of male arrestees by age group.'),
    female_arrests_by_age: countMap('Arrests of female arrestees by age group.'),
    data_last_updated: z
      .string()
      .optional()
      .describe('Date CDE last refreshed arrest data; absent when CDE omits it.'),
    max_data_date: z
      .string()
      .optional()
      .describe('Latest data month CDE reports (MM/YYYY); absent when CDE omits it.'),
  }),

  enrichment: {
    notice: z
      .string()
      .optional()
      .describe(
        'Present when every count is zero; says whether zeros can also mean an unrecognized state or ORI.',
      ),
  },

  async handler(input, ctx) {
    ctx.log.info('fbi_get_arrests', {
      scope: input.scope,
      offense: input.offense,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });
    const range = resolveScopedRange(input, FLOOR_YEAR, ctx);
    const data = await getFbiApiService().getArrestTotals(range, input.offense, ctx);
    const groups = {
      offense_name: data['Offense Name'],
      offense_category: data['Offense Category'],
      offense_breakdown: data['Offense Breakdown'],
      arrestee_sex: data['Arrestee Sex'],
      arrestee_race: data['Arrestee Race'],
      male_arrests_by_age: data['Male Arrests By Age'],
      female_arrests_by_age: data['Female Arrests By Age'],
    };

    if (allCountsZero(Object.values(groups))) ctx.enrich.notice(zeroCountsNotice(range.scope));
    const lastUpdated = data.cde_properties?.last_refresh_date?.UCR;
    const maxDataDate = data.cde_properties?.max_data_date?.UCR;
    return {
      ...scopeEcho(range),
      offense: input.offense,
      offense_label: input.offense === 'all' ? 'All offenses' : OFFENSE_LABELS[input.offense],
      ...groups,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
      ...(maxDataDate && { max_data_date: maxDataDate }),
    };
  },

  format: (result) => {
    const lines = [
      `## FBI Arrests — ${scopeHeading(result)}`,
      scopeLine(result),
      `**Offense:** ${result.offense} (${escapeMarkdown(result.offense_label)}) | **Range:** ${result.from} → ${result.to}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    if (result.max_data_date) lines.push(`**Max data date:** ${result.max_data_date}`);
    lines.push(
      '',
      'Counts are summed over the window; — means CDE sent no value. Each grouping is tallied separately and their sums can differ; they do not sum to one total.',
      ...countTable('Arrests by offense name', result.offense_name),
      ...countTable('Arrests by offense category', result.offense_category),
      ...countTable('Arrests by offense breakdown', result.offense_breakdown),
      ...countTable('Arrests by arrestee sex', result.arrestee_sex),
      ...countTable('Arrests by arrestee race', result.arrestee_race),
      ...countTable('Male arrests by age', result.male_arrests_by_age),
      ...countTable('Female arrests by age', result.female_arrests_by_age),
    );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
