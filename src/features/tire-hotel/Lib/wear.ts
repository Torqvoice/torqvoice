import { TIRE_ROAD_POSITIONS } from './tireConstants'

export type MeasurementLike = {
  position: string
  treadDepthMm: number | null
  condition: string
  measuredAt: Date | string
  movementId?: string | null
}

export type WearRound<T extends MeasurementLike = MeasurementLike> = {
  /** Stable identity for the round: the movement it belongs to, or its time. */
  key: string
  at: Date
  rows: T[]
  /**
   * Millimetres lost per position since the previous round that measured it.
   * Positive means worn down. Absent for the first round, and for a position
   * that round did not measure.
   */
  worn: Record<string, number>
}

/**
 * The readings taken during one visit, newest first.
 *
 * Grouped by movement where there is one, which is how the four readings from
 * a single check-in were meant to be read. Measurements taken outside a
 * movement, a mid-season inspection, fall back to their timestamp, which is
 * transaction-stable in Postgres so one round shares one instant.
 */
export function groupRounds<T extends MeasurementLike>(measurements: T[]): WearRound<T>[] {
  const rounds = new Map<string, { at: Date; rows: T[] }>()

  for (const m of measurements) {
    const at = new Date(m.measuredAt)
    const key = m.movementId ?? `t:${at.getTime()}`
    const round = rounds.get(key)
    if (round) {
      round.rows.push(m)
      // The round happened when its earliest reading was taken.
      if (at < round.at) round.at = at
    } else {
      rounds.set(key, { at, rows: [m] })
    }
  }

  const ordered = [...rounds.entries()]
    .map(([key, value]) => ({ key, at: value.at, rows: value.rows }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())

  return ordered.map((round, index) => ({
    ...round,
    // Compared against every older round, not just the one before it: a
    // check-out that recorded only a damaged corner should not blank the wear
    // on the other three.
    worn: wornSince(round, ordered.slice(index + 1)),
  }))
}

function treadByPosition(rows: MeasurementLike[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    if (typeof row.treadDepthMm === 'number' && Number.isFinite(row.treadDepthMm)) {
      out[row.position] = row.treadDepthMm
    }
  }
  return out
}

function wornSince(
  round: { rows: MeasurementLike[] },
  older: { rows: MeasurementLike[] }[]
): Record<string, number> {
  const now = treadByPosition(round.rows)
  const worn: Record<string, number> = {}

  for (const [position, depth] of Object.entries(now)) {
    for (const previous of older) {
      const before = treadByPosition(previous.rows)[position]
      if (before === undefined) continue
      // Rounded to a tenth: tread gauges do not resolve finer than that, and
      // floating-point noise dressed up as 0.30000000000000004 mm of wear
      // reads as precision the reading never had.
      worn[position] = Math.round((before - depth) * 10) / 10
      break
    }
  }

  return worn
}

export type WearSummary = {
  /** Millimetres lost on the worst position between the two rounds. */
  mm: number
  from: Date
  to: Date
  days: number
  /** Wear projected over six months, the length of an ordinary storage season. */
  perSeason: number
}

/**
 * How much the set has worn between its first and last readings.
 *
 * The worst position, not the average: a set is replaced when one corner
 * reaches the limit, so the corner going down fastest is the one the customer
 * needs to hear about.
 *
 * Returns null when there is nothing to compare, which is the normal state of
 * a set on its first season.
 */
export function wearSummary(rounds: WearRound[]): WearSummary | null {
  if (rounds.length < 2) return null

  const newest = rounds[0]
  const oldest = rounds[rounds.length - 1]

  const now = treadByPosition(newest.rows)
  const before = treadByPosition(oldest.rows)

  let mm = 0
  let compared = false
  for (const position of Object.keys(now)) {
    if (before[position] === undefined) continue
    compared = true
    mm = Math.max(mm, before[position] - now[position])
  }
  if (!compared) return null

  const days = Math.max(
    1,
    Math.round((newest.at.getTime() - oldest.at.getTime()) / (1000 * 60 * 60 * 24))
  )

  return {
    mm: Math.round(mm * 10) / 10,
    from: oldest.at,
    to: newest.at,
    days,
    perSeason: Math.round((mm / days) * 182 * 10) / 10,
  }
}

/**
 * Seasons of wear left before the worst position reaches the replacement
 * limit, at the rate this set has actually worn.
 *
 * Deliberately blunt: it is a talking point at the counter, not a promise.
 * Null when the set has no history to extrapolate from, or when it is not
 * wearing measurably, which for a stored winter set is common and true.
 */
export function seasonsLeft(
  rounds: WearRound[],
  limitMm: number
): { seasons: number; lowest: number } | null {
  const summary = wearSummary(rounds)
  if (!summary || summary.perSeason <= 0) return null

  const now = treadByPosition(rounds[0].rows)
  const depths = Object.values(now)
  if (depths.length === 0) return null

  const lowest = Math.min(...depths)
  const headroom = lowest - limitMm
  if (headroom <= 0) return { seasons: 0, lowest }

  return { seasons: Math.floor(headroom / summary.perSeason), lowest }
}

/** The four road positions a round covered, in walk-around order. */
export function roundPositions(rows: MeasurementLike[]): string[] {
  const present = new Set(rows.map((r) => r.position))
  const ordered = TIRE_ROAD_POSITIONS.filter((p) => present.has(p)) as string[]
  const extra = [...present].filter((p) => !ordered.includes(p)).sort()
  return [...ordered, ...extra]
}
