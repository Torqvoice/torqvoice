import { groupRounds, wearSummary, type MeasurementLike } from './wear'
import { formatTireSize, parseTireSize } from './tireMatching'

export type ForecastVerdict =
  /** Already at or under the replacement limit. No extrapolation involved. */
  | 'now'
  /** On its own measured rate, reaches the limit within one more season. */
  | 'next'
  /** Measured, and has more than a season left. */
  | 'later'
  /** Never measured, or measured only once, so there is no rate to work from. */
  | 'unknown'

export type ForecastSet = {
  id: string
  size: string | null
  season: string
  quantity: number
  measurements: MeasurementLike[]
}

export type SetForecast<T extends ForecastSet = ForecastSet> = {
  set: T
  verdict: ForecastVerdict
  /** Shallowest depth at the last reading, in millimetres. */
  lowest: number | null
  /** Millimetres a season, from this set's own history. */
  rate: number | null
  /** The limit this set was judged against. */
  limitMm: number
}

export type SizeDemand<T extends ForecastSet = ForecastSet> = {
  /** Canonical fitment, e.g. 225/45R17. Falls back to the raw text. */
  size: string
  /** Tires, not sets: what a buyer orders. */
  tires: number
  now: SetForecast<T>[]
  next: SetForecast<T>[]
}

/**
 * When this set is likely to need replacing.
 *
 * "Now" is a measurement, not a prediction: the tread is already at the limit.
 * "Next" is the extrapolation, and it is deliberately crude — one season's
 * headroom against one season's measured wear. A tire hotel is the only party
 * that measures the same four tires twice a year, so the rate is real, but it
 * is two readings from one customer's driving and should be read as a demand
 * signal rather than a promise.
 */
export function forecastSet<T extends ForecastSet>(
  set: T,
  thresholds: { summerReplace: number; winterReplace: number }
): SetForecast<T> {
  const limitMm = set.season === 'winter' ? thresholds.winterReplace : thresholds.summerReplace
  const rounds = groupRounds(set.measurements)

  if (rounds.length === 0) {
    return { set, verdict: 'unknown', lowest: null, rate: null, limitMm }
  }

  const depths = rounds[0].rows
    .map((row) => row.treadDepthMm)
    .filter((depth): depth is number => typeof depth === 'number' && Number.isFinite(depth))

  if (depths.length === 0) {
    return { set, verdict: 'unknown', lowest: null, rate: null, limitMm }
  }

  const lowest = Math.min(...depths)
  if (lowest <= limitMm) {
    return { set, verdict: 'now', lowest, rate: null, limitMm }
  }

  const summary = wearSummary(rounds)
  const rate = summary && summary.perSeason > 0 ? summary.perSeason : null
  if (rate === null) {
    // One visit, or a set that has not worn measurably. Both are ordinary and
    // neither supports a forecast, so it says so rather than guessing.
    return { set, verdict: 'unknown', lowest, rate: null, limitMm }
  }

  return {
    set,
    verdict: lowest - limitMm <= rate ? 'next' : 'later',
    lowest,
    rate,
    limitMm,
  }
}

/**
 * What the shop can expect to sell next season, by fitment.
 *
 * Grouped by size and counted in tires, because that is the unit a buyer
 * orders in and the unit a supplier quotes. Sets already at the limit are kept
 * apart from the extrapolated ones: the first group is what the shop knows,
 * the second is what it is guessing, and a purchase order should be able to
 * tell them apart.
 */
export function replacementDemand<T extends ForecastSet>(
  forecasts: SetForecast<T>[]
): SizeDemand<T>[] {
  const groups = new Map<string, SizeDemand<T>>()

  for (const forecast of forecasts) {
    if (forecast.verdict !== 'now' && forecast.verdict !== 'next') continue

    const parsed = parseTireSize(forecast.set.size)
    // Canonical where it can be read, so 225/45 R17 and P225/45ZR17 94V land
    // in one order line rather than three.
    const size = parsed ? formatTireSize(parsed) : forecast.set.size?.trim() || ''
    if (!size) continue

    const group = groups.get(size) ?? { size, tires: 0, now: [], next: [] }
    group.tires += Math.max(0, forecast.set.quantity)
    if (forecast.verdict === 'now') group.now.push(forecast)
    else group.next.push(forecast)
    groups.set(size, group)
  }

  return [...groups.values()].sort((a, b) => {
    // Most tires first: that is the order a buyer works down.
    if (b.tires !== a.tires) return b.tires - a.tires
    // Then the certain ahead of the extrapolated.
    if (b.now.length !== a.now.length) return b.now.length - a.now.length
    return a.size.localeCompare(b.size)
  })
}

/** Headline counts for the top of the forecast. */
export function demandTotals<T extends ForecastSet>(demand: SizeDemand<T>[]) {
  let tires = 0
  let atLimit = 0
  let expected = 0
  for (const group of demand) {
    tires += group.tires
    for (const forecast of group.now) atLimit += forecast.set.quantity
    for (const forecast of group.next) expected += forecast.set.quantity
  }
  return { tires, atLimit, expected, sizes: demand.length }
}
