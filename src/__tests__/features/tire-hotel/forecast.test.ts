/**
 * Tests for the replacement forecast.
 *
 * A tire hotel measures the same four tires twice a year, which makes it the
 * only party able to say what its customers will need next season. These
 * helpers turn that into something a buyer can order from, while keeping what
 * is measured apart from what is extrapolated.
 */

import { describe, it, expect } from 'vitest'
import {
  forecastSet,
  replacementDemand,
  demandTotals,
  type ForecastSet,
} from '@/features/tire-hotel/Lib/forecast'
import type { MeasurementLike } from '@/features/tire-hotel/Lib/wear'

const LIMITS = { summerReplace: 3, winterReplace: 4 }

function readings(movementId: string, at: string, depths: number[]): MeasurementLike[] {
  const positions = ['front_left', 'front_right', 'rear_left', 'rear_right']
  return depths.map((treadDepthMm, i) => ({
    position: positions[i],
    treadDepthMm,
    condition: 'good',
    measuredAt: new Date(at),
    movementId,
  }))
}

function set(overrides: Partial<ForecastSet> = {}): ForecastSet {
  return {
    id: 's1',
    size: '225/45R17',
    season: 'summer',
    quantity: 4,
    measurements: [],
    ...overrides,
  }
}

describe('when a set needs replacing', () => {
  it('says now when the shallowest corner is already at the limit', () => {
    // Measured, not predicted. This is the half a buyer can rely on.
    const result = forecastSet(
      set({ measurements: readings('m1', '2026-04-01', [5, 5, 3, 6]) }),
      LIMITS
    )
    expect(result.verdict).toBe('now')
    expect(result.lowest).toBe(3)
  })

  it('judges a winter set against the winter limit', () => {
    const summer = forecastSet(set({ measurements: readings('m1', '2026-04-01', [4, 5, 5, 5]) }), LIMITS)
    const winter = forecastSet(
      set({ season: 'winter', measurements: readings('m1', '2026-04-01', [4, 5, 5, 5]) }),
      LIMITS
    )
    expect(summer.verdict).not.toBe('now')
    expect(winter.verdict).toBe('now')
  })

  it('says next when one season of wear would take it past the limit', () => {
    const result = forecastSet(
      set({
        measurements: [
          ...readings('m1', '2025-04-01', [6, 6, 6, 6]),
          ...readings('m2', '2026-04-01', [4, 4.5, 4.5, 4.5]),
        ],
      }),
      LIMITS
    )
    // 4.0 now, limit 3.0, wearing about 1.0 mm a season.
    expect(result.verdict).toBe('next')
    expect(result.rate).toBeCloseTo(1, 1)
  })

  it('says later when there is more than a season of headroom', () => {
    const result = forecastSet(
      set({
        measurements: [
          ...readings('m1', '2025-04-01', [8, 8, 8, 8]),
          ...readings('m2', '2026-04-01', [7.5, 7.5, 7.5, 7.5]),
        ],
      }),
      LIMITS
    )
    expect(result.verdict).toBe('later')
  })

  it('admits it does not know from a single visit', () => {
    // Every set on its first season. Guessing a rate from one reading would
    // be inventing the number the whole feature is supposed to measure.
    const result = forecastSet(
      set({ measurements: readings('m1', '2026-04-01', [6, 6, 6, 6]) }),
      LIMITS
    )
    expect(result.verdict).toBe('unknown')
    expect(result.lowest).toBe(6)
  })

  it('admits it does not know when nothing was measured', () => {
    expect(forecastSet(set(), LIMITS).verdict).toBe('unknown')
  })

  it('admits it does not know when the set is not wearing measurably', () => {
    const result = forecastSet(
      set({
        measurements: [
          ...readings('m1', '2025-04-01', [6, 6, 6, 6]),
          ...readings('m2', '2026-04-01', [6, 6, 6, 6]),
        ],
      }),
      LIMITS
    )
    expect(result.verdict).toBe('unknown')
  })

  it('ignores a round with no depths recorded', () => {
    const blank: MeasurementLike[] = [
      { position: 'front_left', treadDepthMm: null, condition: 'good', measuredAt: new Date('2026-04-01'), movementId: 'm1' },
    ]
    expect(forecastSet(set({ measurements: blank }), LIMITS).verdict).toBe('unknown')
  })
})

describe('what to order', () => {
  const atLimit = forecastSet(
    set({ id: 'a', measurements: readings('m1', '2026-04-01', [3, 4, 4, 4]) }),
    LIMITS
  )
  const dueNext = forecastSet(
    set({
      id: 'b',
      measurements: [
        ...readings('m1', '2025-04-01', [6, 6, 6, 6]),
        ...readings('m2', '2026-04-01', [4, 4, 4, 4]),
      ],
    }),
    LIMITS
  )
  const plenty = forecastSet(
    set({
      id: 'c',
      measurements: [
        ...readings('m1', '2025-04-01', [8, 8, 8, 8]),
        ...readings('m2', '2026-04-01', [7.6, 7.6, 7.6, 7.6]),
      ],
    }),
    LIMITS
  )

  it('counts tires, not sets, because that is what a buyer orders', () => {
    const demand = replacementDemand([atLimit, dueNext])
    expect(demand).toHaveLength(1)
    expect(demand[0].tires).toBe(8)
  })

  it('keeps what is measured apart from what is extrapolated', () => {
    const demand = replacementDemand([atLimit, dueNext])
    expect(demand[0].now.map((f) => f.set.id)).toEqual(['a'])
    expect(demand[0].next.map((f) => f.set.id)).toEqual(['b'])
  })

  it('leaves out sets with a season or more left, and unmeasured ones', () => {
    const unknown = forecastSet(set({ id: 'd' }), LIMITS)
    expect(replacementDemand([plenty, unknown])).toEqual([])
  })

  it('collapses the ways one fitment gets written into a single order line', () => {
    const written = ['225/45R17', '225/45 R17', 'P225/45ZR17 94V'].map((size, i) =>
      forecastSet(
        set({ id: `s${i}`, size, quantity: 4, measurements: readings('m1', '2026-04-01', [3, 3, 3, 3]) }),
        LIMITS
      )
    )
    const demand = replacementDemand(written)
    expect(demand).toHaveLength(1)
    expect(demand[0].size).toBe('225/45R17')
    expect(demand[0].tires).toBe(12)
  })

  it('keeps an unreadable size under its own text rather than dropping it', () => {
    const odd = forecastSet(
      set({ id: 'x', size: '31x10.50R15', measurements: readings('m1', '2026-04-01', [3, 3, 3, 3]) }),
      LIMITS
    )
    const demand = replacementDemand([odd])
    expect(demand[0].size).toBe('31x10.50R15')
  })

  it('drops a set with no size at all, since it cannot be ordered', () => {
    const nameless = forecastSet(
      set({ id: 'y', size: null, measurements: readings('m1', '2026-04-01', [3, 3, 3, 3]) }),
      LIMITS
    )
    expect(replacementDemand([nameless])).toEqual([])
  })

  it('puts the biggest order line first', () => {
    const other = forecastSet(
      set({ id: 'z', size: '205/55R16', quantity: 4, measurements: readings('m1', '2026-04-01', [2, 3, 3, 3]) }),
      LIMITS
    )
    const demand = replacementDemand([other, atLimit, dueNext])
    expect(demand.map((g) => g.size)).toEqual(['225/45R17', '205/55R16'])
  })

  it('totals the two halves separately', () => {
    const totals = demandTotals(replacementDemand([atLimit, dueNext]))
    expect(totals).toEqual({ tires: 8, atLimit: 4, expected: 4, sizes: 1 })
  })
})
