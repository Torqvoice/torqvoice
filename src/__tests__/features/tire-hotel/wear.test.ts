/**
 * Tests for the wear history of a stored set.
 *
 * A set that comes back season after season is the whole point of a tire
 * hotel: the shop holds the same four tires for years and is the only party
 * in a position to say how fast they are going down. These helpers turn a pile
 * of readings into that answer.
 */

import { describe, it, expect } from 'vitest'
import {
  groupRounds,
  wearSummary,
  seasonsLeft,
  roundPositions,
  type MeasurementLike,
} from '@/features/tire-hotel/Lib/wear'

const d = (iso: string) => new Date(iso)

function round(movementId: string, at: string, depths: Record<string, number | null>) {
  return Object.entries(depths).map(([position, treadDepthMm]) => ({
    position,
    treadDepthMm,
    condition: 'good',
    measuredAt: d(at),
    movementId,
  })) as MeasurementLike[]
}

const SPRING_2025 = round('m1', '2025-04-10T09:00:00Z', {
  front_left: 8.0,
  front_right: 8.0,
  rear_left: 8.5,
  rear_right: 8.5,
})
const AUTUMN_2025 = round('m2', '2025-10-12T09:00:00Z', {
  front_left: 6.8,
  front_right: 7.0,
  rear_left: 8.0,
  rear_right: 8.1,
})
const SPRING_2026 = round('m3', '2026-04-08T09:00:00Z', {
  front_left: 5.4,
  front_right: 5.8,
  rear_left: 7.4,
  rear_right: 7.6,
})

describe('grouping readings into visits', () => {
  it('groups by the movement they were taken during', () => {
    const rounds = groupRounds([...SPRING_2025, ...AUTUMN_2025])
    expect(rounds).toHaveLength(2)
    expect(rounds.map((r) => r.key)).toEqual(['m2', 'm1'])
  })

  it('lists the newest visit first', () => {
    const rounds = groupRounds([...SPRING_2025, ...SPRING_2026, ...AUTUMN_2025])
    expect(rounds.map((r) => r.at.getFullYear())).toEqual([2026, 2025, 2025])
    expect(rounds[0].key).toBe('m3')
  })

  it('falls back to the timestamp for readings taken outside a movement', () => {
    // A mid-season inspection: no check-in, no check-out, just a gauge.
    const loose: MeasurementLike[] = [
      { position: 'front_left', treadDepthMm: 7.2, condition: 'good', measuredAt: d('2025-07-01') },
      { position: 'front_right', treadDepthMm: 7.3, condition: 'good', measuredAt: d('2025-07-01') },
    ]
    const rounds = groupRounds([...SPRING_2025, ...loose])
    expect(rounds).toHaveLength(2)
    expect(rounds[0].rows).toHaveLength(2)
  })
})

describe('wear between visits', () => {
  it('reports what each corner lost since the visit before', () => {
    const rounds = groupRounds([...SPRING_2025, ...AUTUMN_2025])
    expect(rounds[0].worn).toEqual({
      front_left: 1.2,
      front_right: 1.0,
      rear_left: 0.5,
      rear_right: 0.4,
    })
  })

  it('leaves the first visit with nothing to compare against', () => {
    const rounds = groupRounds([...SPRING_2025, ...AUTUMN_2025])
    expect(rounds[1].worn).toEqual({})
  })

  it('reaches past a visit that skipped a corner', () => {
    // A check-out that only recorded the damaged corner must not blank the
    // wear on the other three, or a season of history disappears.
    const partial = round('m2', '2025-10-12T09:00:00Z', { front_left: 6.8 })
    const rounds = groupRounds([...SPRING_2025, ...partial, ...SPRING_2026])

    expect(rounds[0].worn.front_left).toBe(1.4)
    // Compared against spring 2025, the last visit that measured it.
    expect(rounds[0].worn.rear_left).toBe(1.1)
  })

  it('rounds to a tenth, since a tread gauge does not resolve finer', () => {
    const before = round('m1', '2025-04-10', { front_left: 8.1 })
    const after = round('m2', '2025-10-10', { front_left: 7.8 })
    const rounds = groupRounds([...before, ...after])
    expect(rounds[0].worn.front_left).toBe(0.3)
  })

  it('ignores a position with no depth recorded', () => {
    const blank = round('m2', '2025-10-12', { front_left: null })
    const rounds = groupRounds([...SPRING_2025, ...blank])
    expect(rounds[0].worn).toEqual({})
  })
})

describe('wear across the whole history', () => {
  it('measures the worst corner from the first visit to the last', () => {
    const summary = wearSummary(groupRounds([...SPRING_2025, ...AUTUMN_2025, ...SPRING_2026]))
    // front_left: 8.0 down to 5.4.
    expect(summary?.mm).toBe(2.6)
    expect(summary?.from.getFullYear()).toBe(2025)
    expect(summary?.to.getFullYear()).toBe(2026)
  })

  it('projects the rate over a six-month season', () => {
    const summary = wearSummary(groupRounds([...SPRING_2025, ...SPRING_2026]))
    // 2.6 mm over 363 days is roughly 1.3 mm per half year.
    expect(summary?.perSeason).toBeCloseTo(1.3, 1)
  })

  it('says nothing on a set with one visit', () => {
    // Which is every set on its first season, and not a failure.
    expect(wearSummary(groupRounds(SPRING_2025))).toBeNull()
  })

  it('says nothing when the visits share no measured position', () => {
    const front = round('m1', '2025-04-10', { front_left: 8 })
    const rear = round('m2', '2025-10-10', { rear_left: 7 })
    expect(wearSummary(groupRounds([...front, ...rear]))).toBeNull()
  })
})

describe('how many seasons are left', () => {
  it('divides the headroom by the rate the set is actually wearing', () => {
    const rounds = groupRounds([...SPRING_2025, ...SPRING_2026])
    const left = seasonsLeft(rounds, 3)
    // Lowest corner is 5.4, limit 3, so 2.4 mm of headroom at ~1.3 mm a season.
    expect(left?.lowest).toBe(5.4)
    expect(left?.seasons).toBe(1)
  })

  it('returns zero seasons once the set is already at the limit', () => {
    const worn = round('m3', '2026-04-08', { front_left: 2.5, front_right: 4 })
    const left = seasonsLeft(groupRounds([...SPRING_2025, ...worn]), 3)
    expect(left?.seasons).toBe(0)
  })

  it('says nothing about a set that is not wearing measurably', () => {
    // Common and true for a set that spent the year on a shelf.
    const same = round('m2', '2025-10-10', { front_left: 8.0 })
    const first = round('m1', '2025-04-10', { front_left: 8.0 })
    expect(seasonsLeft(groupRounds([...first, ...same]), 3)).toBeNull()
  })

  it('says nothing without a history to extrapolate from', () => {
    expect(seasonsLeft(groupRounds(SPRING_2025), 3)).toBeNull()
  })
})

describe('position order', () => {
  it('walks around the car rather than following the database', () => {
    const rows = round('m1', '2025-04-10', {
      rear_right: 8,
      front_left: 8,
      rear_left: 8,
      front_right: 8,
    })
    expect(roundPositions(rows)).toEqual([
      'front_left',
      'front_right',
      'rear_left',
      'rear_right',
    ])
  })

  it('keeps anything unusual, after the four road positions', () => {
    const rows = round('m1', '2025-04-10', { spare: 7, front_left: 8 })
    expect(roundPositions(rows)).toEqual(['front_left', 'spare'])
  })
})
