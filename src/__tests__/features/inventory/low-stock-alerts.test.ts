/**
 * Tests for the low-stock alert decision logic.
 *
 * These exist mainly to pin the anti-spam behaviour. The failure mode this
 * feature must never have is "a part that is out of stock emails me every hour
 * forever", so the transition rules and the email throttle are covered
 * explicitly rather than incidentally.
 */

import { describe, it, expect } from 'vitest'
import {
  buildAlertSummary,
  canSendDigestEmail,
  decideLowStockAlerts,
  effectiveThreshold,
  formatLowStockLine,
  isLow,
  type LowStockCandidate,
} from '@/features/inventory/Lib/lowStockAlerts'

function part(over: Partial<LowStockCandidate> = {}): LowStockCandidate {
  return {
    id: 'p1',
    name: 'Brake pad',
    partNumber: 'BP-1',
    quantity: 1,
    minQuantity: 5,
    unit: null,
    lowStockAlertedAt: null,
    ...over,
  }
}

describe('isLow', () => {
  it('is low at or below the reorder point', () => {
    expect(isLow({ quantity: 5, minQuantity: 5 })).toBe(true)
    expect(isLow({ quantity: 4, minQuantity: 5 })).toBe(true)
    expect(isLow({ quantity: 0, minQuantity: 5 })).toBe(true)
  })

  it('is not low above the reorder point', () => {
    expect(isLow({ quantity: 6, minQuantity: 5 })).toBe(false)
  })

  it('never flags parts with no reorder point configured', () => {
    // minQuantity 0 means "not tracked" — 0 on hand is not an alert.
    expect(isLow({ quantity: 0, minQuantity: 0 })).toBe(false)
  })
})

describe('effectiveThreshold — org-wide default', () => {
  it("prefers the part's own reorder point over the default", () => {
    expect(effectiveThreshold({ minQuantity: 5 }, 3)).toBe(5)
  })

  it('falls back to the org default when the part has none', () => {
    expect(effectiveThreshold({ minQuantity: 0 }, 3)).toBe(3)
  })

  it('is off when neither is set', () => {
    expect(effectiveThreshold({ minQuantity: 0 }, 0)).toBe(0)
  })

  it('watches unconfigured parts once a default is set', () => {
    // Without a default this part is invisible to alerting; with one it is not.
    expect(isLow({ quantity: 2, minQuantity: 0 })).toBe(false)
    expect(isLow({ quantity: 2, minQuantity: 0 }, 3)).toBe(true)
  })

  it('lets a part opt out of a strict org default with a higher own value', () => {
    expect(isLow({ quantity: 4, minQuantity: 10 }, 2)).toBe(true)
    expect(isLow({ quantity: 4, minQuantity: 2 }, 10)).toBe(false)
  })

  it('routes the default through the alert decision', () => {
    const { newlyLow } = decideLowStockAlerts(
      [part({ id: 'unconfigured', quantity: 1, minQuantity: 0, lowStockAlertedAt: null })],
      3
    )
    expect(newlyLow.map((p) => p.id)).toEqual(['unconfigured'])
  })

  it('quotes the threshold actually applied in the digest line', () => {
    expect(formatLowStockLine(part({ quantity: 1, minQuantity: 0 }), 3)).toBe(
      'Brake pad (BP-1): 1 left, reorder at 3'
    )
  })
})

describe('decideLowStockAlerts — no-spam guarantees', () => {
  it('alerts the first time a part drops below its reorder point', () => {
    const { newlyLow } = decideLowStockAlerts([part({ lowStockAlertedAt: null })])
    expect(newlyLow.map((p) => p.id)).toEqual(['p1'])
  })

  it('stays silent on later runs while the part is still low', () => {
    // The critical case: a part sitting at zero must not re-alert every hour.
    const { newlyLow, toRearm } = decideLowStockAlerts([
      part({ quantity: 0, lowStockAlertedAt: new Date('2026-07-01') }),
    ])
    expect(newlyLow).toHaveLength(0)
    expect(toRearm).toHaveLength(0)
  })

  it('re-arms once stock climbs back above the reorder point', () => {
    const { newlyLow, toRearm } = decideLowStockAlerts([
      part({ quantity: 10, lowStockAlertedAt: new Date('2026-07-01') }),
    ])
    expect(newlyLow).toHaveLength(0)
    expect(toRearm).toEqual(['p1'])
  })

  it('alerts again after a genuine restock-then-drop cycle', () => {
    // Recovered: marker cleared.
    const recovered = decideLowStockAlerts([
      part({ quantity: 10, lowStockAlertedAt: new Date('2026-07-01') }),
    ])
    expect(recovered.toRearm).toEqual(['p1'])

    // Dropped again with the marker now null: a second, real event.
    const droppedAgain = decideLowStockAlerts([part({ quantity: 2, lowStockAlertedAt: null })])
    expect(droppedAgain.newlyLow.map((p) => p.id)).toEqual(['p1'])
  })

  it('does not re-arm a healthy part that was never alerted', () => {
    const { toRearm } = decideLowStockAlerts([part({ quantity: 10, lowStockAlertedAt: null })])
    expect(toRearm).toHaveLength(0)
  })

  it('separates newly low from already-alerted across a mixed inventory', () => {
    const { newlyLow, toRearm } = decideLowStockAlerts([
      part({ id: 'new', quantity: 1, lowStockAlertedAt: null }),
      part({ id: 'still-low', quantity: 0, lowStockAlertedAt: new Date() }),
      part({ id: 'recovered', quantity: 99, lowStockAlertedAt: new Date() }),
      part({ id: 'healthy', quantity: 99, lowStockAlertedAt: null }),
      part({ id: 'untracked', quantity: 0, minQuantity: 0, lowStockAlertedAt: null }),
    ])
    expect(newlyLow.map((p) => p.id)).toEqual(['new'])
    expect(toRearm).toEqual(['recovered'])
  })
})

describe('canSendDigestEmail — throttle', () => {
  const now = new Date('2026-07-27T12:00:00Z')

  it('allows the first ever digest', () => {
    expect(canSendDigestEmail(null, now, 24)).toBe(true)
  })

  it('blocks a second digest inside the minimum interval', () => {
    const twoHoursAgo = new Date('2026-07-27T10:00:00Z')
    expect(canSendDigestEmail(twoHoursAgo, now, 24)).toBe(false)
  })

  it('allows a digest once the interval has elapsed', () => {
    const yesterday = new Date('2026-07-26T11:00:00Z')
    expect(canSendDigestEmail(yesterday, now, 24)).toBe(true)
  })

  it('treats a zero or negative interval as no throttle', () => {
    const oneMinuteAgo = new Date('2026-07-27T11:59:00Z')
    expect(canSendDigestEmail(oneMinuteAgo, now, 0)).toBe(true)
  })
})

describe('digest formatting', () => {
  it('states the shortfall and the reorder point', () => {
    expect(formatLowStockLine(part({ quantity: 2, minQuantity: 5 }))).toBe(
      'Brake pad (BP-1): 2 left, reorder at 5'
    )
  })

  it('carries the unit of measure into the line', () => {
    expect(
      formatLowStockLine(
        part({ name: 'Engine oil 5W-30', partNumber: null, quantity: 1.5, unit: 'l' })
      )
    ).toBe('Engine oil 5W-30: 1.5 l left, reorder at 5')
  })

  it('omits an absent part number', () => {
    expect(formatLowStockLine(part({ partNumber: null, quantity: 0 }))).toBe(
      'Brake pad: 0 left, reorder at 5'
    )
  })

  it('groups many parts into a single notification', () => {
    const summary = buildAlertSummary([
      part({ id: 'a', name: 'A' }),
      part({ id: 'b', name: 'B' }),
      part({ id: 'c', name: 'C' }),
      part({ id: 'd', name: 'D' }),
      part({ id: 'e', name: 'E' }),
    ])
    expect(summary.title).toBe('5 parts low on stock')
    expect(summary.message).toBe('A, B, C and 2 more')
  })

  it('names the part directly when only one is low', () => {
    const summary = buildAlertSummary([part({ quantity: 1, minQuantity: 5 })])
    expect(summary.title).toBe('Low stock')
    expect(summary.message).toContain('Brake pad')
  })
})
