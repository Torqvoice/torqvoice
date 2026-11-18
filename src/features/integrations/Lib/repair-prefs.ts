import type { LaborTime, RepairDataConfidence } from './types'

/**
 * How a workshop has set up its labor guide, read from the connection's
 * settings. Shared by the server, which filters what the dialog is sent, and
 * by the dialog, which works out the hours a job adds. No server imports.
 */

export const MIN_CONFIDENCE = ['all', 'medium', 'high', 'oem'] as const
export const HOURS_FROM = ['book', 'high'] as const
export const ROUNDING = ['none', '0.1', '0.25', '0.5'] as const
export const FLUID_UNITS = ['both', 'metric', 'us'] as const

export type MinConfidence = (typeof MIN_CONFIDENCE)[number]
export type HoursFrom = (typeof HOURS_FROM)[number]
export type Rounding = (typeof ROUNDING)[number]
export type FluidUnits = (typeof FLUID_UNITS)[number]

export interface RepairDataPrefs {
  /** The lowest confidence a labor time needs to be listed. */
  minConfidence: MinConfidence
  /** Which figure a job adds: the book time, or the top of its range. */
  hoursFrom: HoursFrom
  /** Added to every time, in percent: 10 adds a tenth, -10 takes one off. */
  adjustPercent: number
  /** The step a job's hours are rounded up to, or none. */
  rounding: Rounding
  /** Whether the guide has a fluids tab. */
  fluids: boolean
  /** Which units fluid capacities and intervals are shown in. */
  units: FluidUnits
}

export const DEFAULT_PREFS: RepairDataPrefs = {
  minConfidence: 'all',
  hoursFrom: 'book',
  adjustPercent: 0,
  rounding: 'none',
  fluids: true,
  units: 'both',
}

/** The adjustment a workshop can set: from half the book time to three times it. */
export const ADJUST_LIMITS = { min: -50, max: 200 } as const

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/** The connection's settings as prefs; anything missing or out of range falls back to the default. */
export function readPrefs(settings: Record<string, unknown> | null | undefined): RepairDataPrefs {
  const s = settings ?? {}
  const adjust = Number(s.adjustPercent)
  return {
    minConfidence: oneOf(s.minConfidence, MIN_CONFIDENCE, DEFAULT_PREFS.minConfidence),
    hoursFrom: oneOf(s.hoursFrom, HOURS_FROM, DEFAULT_PREFS.hoursFrom),
    adjustPercent: Number.isFinite(adjust)
      ? Math.min(ADJUST_LIMITS.max, Math.max(ADJUST_LIMITS.min, adjust))
      : DEFAULT_PREFS.adjustPercent,
    rounding: oneOf(s.rounding, ROUNDING, DEFAULT_PREFS.rounding),
    fluids: s.fluids === undefined ? DEFAULT_PREFS.fluids : s.fluids !== false,
    units: oneOf(s.units, FLUID_UNITS, DEFAULT_PREFS.units),
  }
}

const RANK: Record<RepairDataConfidence, number> = { estimated: 0, medium: 1, high: 2, oem: 3 }

/**
 * Whether a value is sure enough to list. A value the key has not unlocked
 * yet has no confidence to judge, so it stays listed until it is shown.
 */
export function meetsConfidence(
  item: { confidence: RepairDataConfidence | null; locked: boolean },
  min: MinConfidence
): boolean {
  if (min === 'all' || item.locked) return true
  if (!item.confidence) return false
  return RANK[item.confidence] >= RANK[min]
}

/**
 * The hours a job adds as a labor line: the book time or the top of its
 * range, adjusted, then rounded up to the workshop's step. Null while the
 * key has not unlocked the job.
 */
export function hoursToAdd(
  job: Pick<LaborTime, 'hours' | 'high'>,
  prefs: Pick<RepairDataPrefs, 'hoursFrom' | 'adjustPercent' | 'rounding'>
): number | null {
  const base = prefs.hoursFrom === 'high' && job.high !== null ? job.high : job.hours
  if (base === null) return null
  let hours = base * (1 + prefs.adjustPercent / 100)
  if (prefs.rounding !== 'none') {
    const step = Number(prefs.rounding)
    // The small allowance keeps 1.2 at 1.2 instead of floating up to 1.3.
    hours = Math.ceil(hours / step - 1e-9) * step
  }
  return Math.round(hours * 100) / 100
}

/** Whether the hours a job adds differ from its book time, so the dialog shows both. */
export function adjustsHours(
  prefs: Pick<RepairDataPrefs, 'hoursFrom' | 'adjustPercent' | 'rounding'>
): boolean {
  return prefs.hoursFrom !== 'book' || prefs.adjustPercent !== 0 || prefs.rounding !== 'none'
}
