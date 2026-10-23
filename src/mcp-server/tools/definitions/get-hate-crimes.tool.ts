/**
 * @fileoverview FBI CDE hate crime totals tool: incidents by bias motivation and category, and
 * CDE's bias_section breakdowns, summed over a month window at national, state, or agency scope.
 * @module mcp-server/tools/definitions/get-hate-crimes.tool
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

/** First year /hate-crime/ serves; CDE rejects earlier windows. */
const FLOOR_YEAR = 1991;

/**
 * CDE bias codes, each probed live to filter to exactly its label. CDE's own spec enum omits
 * 15, 21, 26, 28, 33, 42, and 61, which filter all the same. An unlisted code returns HTTP 200
 * with every count zero, indistinguishable from a real zero, so the enum is enforced locally.
 */
const BIAS_LABELS = {
  '11': 'Anti-White',
  '12': 'Anti-Black or African American',
  '13': 'Anti-American Indian or Alaska Native',
  '14': 'Anti-Asian',
  '15': 'Anti-Multiple Races, Group',
  '16': 'Anti-Native Hawaiian or Other Pacific Islander',
  '21': 'Anti-Jewish',
  '22': 'Anti-Catholic',
  '23': 'Anti-Protestant',
  '24': 'Anti-Islamic (Muslim)',
  '25': 'Anti-Other Religion',
  '26': 'Anti-Multiple Religions, Group',
  '27': 'Anti-Atheism/Agnosticism',
  '28': 'Anti-Church of Jesus Christ',
  '29': "Anti-Jehovah's Witness",
  '31': 'Anti-Arab',
  '32': 'Anti-Hispanic or Latino',
  '33': 'Anti-Other Race/Ethnicity/Ancestry',
  '41': 'Anti-Gay (Male)',
  '42': 'Anti-Lesbian (Female)',
  '43': 'Anti-Lesbian, Gay, Bisexual, or Transgender (Mixed Group)',
  '44': 'Anti-Heterosexual',
  '45': 'Anti-Bisexual',
  '51': 'Anti-Physical Disability',
  '52': 'Anti-Mental Disability',
  '61': 'Anti-Male',
  '62': 'Anti-Female',
  '71': 'Anti-Transgender',
  '72': 'Anti-Gender Non-Conforming',
  '81': 'Anti-Eastern Orthodox (Russian, Greek, Other)',
  '82': 'Anti-Other Christian',
  '83': 'Anti-Buddhist',
  '84': 'Anti-Hindu',
  '85': 'Anti-Sikh',
} as const;

type BiasCode = keyof typeof BIAS_LABELS;
const BIAS_VALUES: ['all', ...BiasCode[]] = ['all', ...(Object.keys(BIAS_LABELS) as BiasCode[])];

const { scope: scopeField, ...rangeFields } = scopedRangeFields(FLOOR_YEAR);

export const fbiGetHateCrimes = tool('fbi_get_hate_crimes', {
  title: 'FBI Get Hate Crimes',
  description: `Hate crime counts reported to FBI CDE for the nation, a state, or an agency, summed over a month window from January ${FLOOR_YEAR} through the current year. Returns incidents by bias motivation and bias category, plus counts by offense type, location type, offender race, offender ethnicity, and federal judicial district, with every category CDE reports, zeros included. Narrow to one bias motivation with bias. National scope omits identifiers; state requires only state_abbr; agency requires only ori (look it up with fbi_search_agencies). CDE returns zeros both when nothing was reported and when it does not recognize a state or ORI.`,
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
    bias: z
      .enum(BIAS_VALUES)
      .default('all')
      .describe(
        `Bias motivation code to narrow the counts to, or all (default). With a code, incidents count that motivation plus multiple-bias incidents that include it. Codes: ${codeListing(BIAS_LABELS)}.`,
      ),
    ...rangeFields,
  }),

  output: z.object({
    ...scopeEchoFields,
    bias: z.enum(BIAS_VALUES).describe('Bias motivation code applied, or all.'),
    bias_label: z
      .string()
      .describe('CDE label for the applied bias code; "All bias motivations" for all.'),
    incident_section: z
      .object({
        bias: countMap(
          'Incidents by bias motivation; Multiple Bias counts incidents with more than one motivation.',
        ),
        bias_category: countMap('Incidents by bias category.'),
      })
      .describe('Incident counts summed over the window.'),
    bias_section: z
      .object({
        offense_type: countMap('Counts by offense type.'),
        location_type: countMap('Counts by location type.'),
        offender_race: countMap('Counts by offender race.'),
        offender_ethnicity: countMap('Counts by offender ethnicity.'),
        judicial_district: countMap('Counts by federal judicial district.'),
      })
      .describe(
        "CDE's bias_section breakdowns summed over the window. Each dimension is counted on its own basis, so the dimensions do not sum to one total or to the incident count.",
      ),
    data_last_updated: z
      .string()
      .optional()
      .describe('Date CDE last refreshed hate crime data; absent when CDE omits it.'),
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
    ctx.log.info('fbi_get_hate_crimes', {
      scope: input.scope,
      bias: input.bias,
      state_abbr: input.state_abbr,
      ori: input.ori,
    });
    const range = resolveScopedRange(input, FLOOR_YEAR, ctx);
    const data = await getFbiApiService().getHateCrimeTotals(range, input.bias, ctx);
    const { incident_section, bias_section } = data;

    if (allCountsZero([...Object.values(incident_section), ...Object.values(bias_section)])) {
      ctx.enrich.notice(zeroCountsNotice(range.scope));
    }
    const lastUpdated = data.last_refresh_date?.UCR;
    return {
      ...scopeEcho(range),
      bias: input.bias,
      bias_label: input.bias === 'all' ? 'All bias motivations' : BIAS_LABELS[input.bias],
      incident_section,
      bias_section,
      ...(lastUpdated && { data_last_updated: lastUpdated }),
    };
  },

  format: (result) => {
    const incidents = result.incident_section;
    const breakdowns = result.bias_section;
    const lines = [
      `## FBI Hate Crimes — ${scopeHeading(result)}`,
      scopeLine(result),
      `**Bias:** ${result.bias} (${escapeMarkdown(result.bias_label)}) | **Range:** ${result.from} → ${result.to}`,
    ];
    if (result.data_last_updated) lines.push(`**Data last updated:** ${result.data_last_updated}`);
    lines.push(
      '',
      'Counts are summed over the window; — means CDE sent no value.',
      ...countTable('Incidents by bias', incidents.bias),
      ...countTable('Incidents by bias category', incidents.bias_category),
      '',
      'Bias section: each dimension is counted on its own basis, so they do not sum to one total.',
      ...countTable('Offense type', breakdowns.offense_type),
      ...countTable('Location type', breakdowns.location_type),
      ...countTable('Offender race', breakdowns.offender_race),
      ...countTable('Offender ethnicity', breakdowns.offender_ethnicity),
      ...countTable('Judicial district', breakdowns.judicial_district),
    );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
