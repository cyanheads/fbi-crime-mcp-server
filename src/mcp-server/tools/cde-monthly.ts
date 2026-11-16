/**
 * @fileoverview Opt-in monthly rows for the CDE totals tools, read from the `type=counts` view of
 * the same path and selector: the `include_monthly` input field, the paired totals and counts
 * requests, the `monthly` output schema, the row builder (MM-YYYY keys sorted chronologically,
 * CDE's -1 rate read as null), and the markdown month table.
 * @module mcp-server/tools/cde-monthly
 */

import { type Context, z } from '@cyanheads/mcp-ts-core';
import { serializationError } from '@cyanheads/mcp-ts-core/errors';
import {
  formatNumber,
  formatPercent,
  type IdentifierCheck,
} from '@/mcp-server/tools/cde-totals.js';
import type { FbiMonthlyCounts } from '@/services/fbi-api/types.js';

/** The `include_monthly` input field of every totals tool. */
export const includeMonthlyField = z
  .boolean()
  .default(false)
  .describe(
    "Also return monthly: one row per month of the window for the scoped entity, with this selection's counts and rates, population, participating population, and reporting coverage, from CDE's monthly view (one more request).",
  );

/**
 * The totals request, and with `includeMonthly` the counts request for the same path, run side by
 * side. Both requests share one signal: caller cancellation reaches each, and the first request to
 * fail aborts the other, so a sibling waiting out retry backoff stops spending the API key's quota.
 * The call settles once both have, and throws the first failure's own error, never the sibling's
 * abort.
 */
export async function totalsWithCounts<T>(
  ctx: Context,
  includeMonthly: boolean,
  totals: (ctx: Context) => Promise<T>,
  counts: (ctx: Context) => Promise<FbiMonthlyCounts>,
): Promise<[T, FbiMonthlyCounts | undefined]> {
  if (!includeMonthly) return [await totals(ctx), undefined];
  const siblings = new AbortController();
  const shared: Context = { ...ctx, signal: AbortSignal.any([ctx.signal, siblings.signal]) };
  const abortSiblingOnFailure = <R>(request: Promise<R>) =>
    request.catch((error: unknown) => {
      siblings.abort();
      throw error;
    });
  const requests = [
    abortSiblingOnFailure(totals(shared)),
    abortSiblingOnFailure(counts(shared)),
  ] as const;
  try {
    return await Promise.all(requests);
  } catch (error) {
    await Promise.allSettled(requests);
    throw error;
  }
}

/** One monthly column: the CDE series it reads, its table header, and what it holds. */
interface SeriesColumn {
  description: string;
  header: string;
  /** Series name in CDE's `{Entity} {series}` keys, e.g. `Arrests`. */
  series: string;
}

type Columns<K extends string> = Readonly<Record<K, SeriesColumn>>;

/** One month for the scoped entity: the tool's counts and rates, then populations and coverage. */
type MonthlyRow<C extends string, R extends string> = {
  year: number;
  month: number;
} & Record<C | R, number | null> & {
    population: number | null;
    participated_population: number | null;
    population_coverage_percent: number | null;
  };

/** CDE's month key; months outside 01–12 fail the parse. */
const MONTH_KEY = /^(0[1-9]|1[0-2])-(\d{4})$/;

function columnEntries<K extends string>(columns: Columns<K>): [K, SeriesColumn][] {
  return Object.entries<SeriesColumn>(columns) as [K, SeriesColumn][];
}

function nullableNumbers<K extends string>(columns: Columns<K>, note: string) {
  return Object.fromEntries(
    columnEntries(columns).map(([field, column]) => [
      field,
      z.number().nullable().describe(`${column.description} ${note}`),
    ]),
  ) as Record<K, z.ZodNullable<z.ZodNumber>>;
}

/** The scoped entity: the name before a count series in an `actuals` key. */
function scopedEntity(
  actuals: FbiMonthlyCounts['actuals'],
  series: readonly string[],
): string | undefined {
  for (const key of Object.keys(actuals ?? {})) {
    const name = series.find((candidate) => key.endsWith(` ${candidate}`));
    if (name) return key.slice(0, -(name.length + 1));
  }
  return;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const match = MONTH_KEY.exec(key);
  if (!match)
    throw serializationError('Malformed FBI counts response: expected MM-YYYY month keys.');
  return { month: Number(match[1]), year: Number(match[2]) };
}

/**
 * What the monthly rows say about the scoped identifier: `unchecked` when monthly was not
 * requested, `unreported` when every row lacks a participated_population.
 */
export function identifierCheck(
  rows: readonly { participated_population: number | null }[] | null | undefined,
): IdentifierCheck {
  if (rows === undefined) return 'unchecked';
  if (rows === null) return 'unrecognized';
  return rows.length > 0 && rows.every((row) => row.participated_population === null)
    ? 'unreported'
    : 'recognized';
}

/**
 * The monthly schema, row builder, and table for one tool's series: `counts` fields read the
 * scoped entity's `actuals`, `rates` fields its `rates`, both keyed by CDE series name.
 */
export function monthlySeries<C extends string, R extends string>(spec: {
  counts: Columns<C>;
  rates: Columns<R>;
}) {
  type Row = MonthlyRow<C, R>;
  const counts = columnEntries(spec.counts);
  const rates = columnEntries(spec.rates);

  const row = z
    .object({
      year: z.number().int().describe('Year.'),
      month: z.number().int().min(1).max(12).describe('Month (1–12).'),
      ...nullableNumbers(
        spec.counts,
        'In a month whose participated_population is null no agency reported, so the count is not a reported zero.',
      ),
      ...nullableNumbers(
        spec.rates,
        'Per 100,000 participating population; null when CDE sends none, including its -1 for a month with no participating population.',
      ),
      population: z
        .number()
        .nullable()
        .describe('Population CDE assigns the scoped entity for the month; null when unavailable.'),
      participated_population: z
        .number()
        .nullable()
        .describe(
          'Population covered by the agencies that reported for the month; null when none reported.',
        ),
      population_coverage_percent: z
        .number()
        .nullable()
        .describe(
          "CDE's reporting coverage percentage for the month, never calculated; null when unavailable, as at agency scope.",
        ),
    })
    .describe('One month for the scoped entity.');

  return {
    /** The `monthly` output field. */
    field: z
      .array(row)
      .optional()
      .describe(
        "Present only when include_monthly is true: one row per month of the window for the scoped entity, in chronological order, from CDE's monthly view. Empty when CDE does not recognize the state or ORI.",
      ),

    /**
     * Every month CDE sent for the scoped entity, sorted chronologically (CDE sends MM-YYYY keys
     * in string order). Null when CDE names no series for the state or ORI.
     * @throws SerializationError on a month key that is not MM-YYYY.
     */
    rows(data: FbiMonthlyCounts): Row[] | null {
      const entity = scopedEntity(
        data.actuals,
        counts.map(([, column]) => column.series),
      );
      if (entity === undefined) return null;
      const seriesOf = (map: FbiMonthlyCounts['rates'], column: SeriesColumn) =>
        map?.[`${entity} ${column.series}`] ?? {};
      const countSeries = counts.map(
        ([field, column]) => [field, seriesOf(data.actuals, column)] as const,
      );
      const rateSeries = rates.map(
        ([field, column]) => [field, seriesOf(data.rates, column)] as const,
      );
      const keys = new Set(
        [...countSeries, ...rateSeries].flatMap(([, series]) => Object.keys(series)),
      );
      const population = data.populations?.population?.[entity];
      const participated = data.populations?.participated_population?.[entity];
      const coverage = data.tooltips?.['Percent of Population Coverage']?.[entity];
      return [...keys]
        .map((key) => ({ key, ...parseMonthKey(key) }))
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .map(
          ({ key, year, month }) =>
            ({
              year,
              month,
              ...Object.fromEntries(
                countSeries.map(([field, series]) => [field, series[key] ?? null]),
              ),
              ...Object.fromEntries(
                rateSeries.map(([field, series]) => {
                  const rate = series[key] ?? null;
                  return [field, rate === -1 ? null : rate];
                }),
              ),
              population: population?.[key] ?? null,
              participated_population: participated?.[key] ?? null,
              population_coverage_percent: coverage?.[key] ?? null,
            }) as Row,
        );
    },

    /** The month table: one row per month, every column, — for a value CDE did not send. */
    table(monthly: readonly Row[]): string[] {
      if (monthly.length === 0)
        return ['', '### Monthly counts', 'CDE sent no monthly series for this state or ORI.'];
      const columns = [...counts, ...rates];
      return [
        '',
        'Monthly counts: rates are per 100,000 participating population; — means CDE sent no value. A month with no participating population had no reporting agencies, so its counts are not reported zeros.',
        '',
        '### Monthly counts',
        `| Year | Month | ${columns.map(([, column]) => column.header).join(' | ')} | Population | Participating population | Population coverage |`,
        `|:-----|:-----:|${'---:|'.repeat(columns.length + 3)}`,
        ...monthly.map(
          (month) =>
            `| ${month.year} | ${String(month.month).padStart(2, '0')} | ${columns.map(([field]) => formatNumber(month[field])).join(' | ')} | ${formatNumber(month.population)} | ${formatNumber(month.participated_population)} | ${formatPercent(month.population_coverage_percent)} |`,
        ),
      ];
    },
  };
}
