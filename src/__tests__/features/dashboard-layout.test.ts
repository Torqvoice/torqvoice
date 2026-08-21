import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_CARD_IDS,
  DEFAULT_LAYOUT,
  LAYOUT_VERSION,
  normalizeLayout,
  type CardLayout,
  type DashboardCardId,
} from '@/features/dashboard/dashboard-grid-config'

/**
 * The dashboard grid compacts vertically and per-column, so a half card with
 * no partner leaves a hole beside it rather than closing up. Which cards are
 * present varies. Sms and notifications are mutually exclusive, and both the
 * getting-started and tire hotel cards are conditional, so the default
 * layout has to stay paired across every combination, not just the one the
 * author had in mind.
 */

const GRID_COLS = 12

/** The cards actually handed to the grid for a given shop configuration. */
function visibleFor(config: {
  smsEnabled: boolean
  onboarding: boolean
  tireHotel: boolean
}): DashboardCardId[] {
  const excluded = new Set<DashboardCardId>([
    config.smsEnabled ? 'notifications' : 'sms',
    ...(config.onboarding ? [] : (['gettingStarted'] as const)),
    ...(config.tireHotel ? [] : (['tireHotel'] as const)),
  ])
  return DASHBOARD_CARD_IDS.filter((id) => !excluded.has(id))
}

function overlaps(a: CardLayout, b: CardLayout): boolean {
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w
  const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h
  return xOverlap && yOverlap
}

const CONFIGS = [true, false].flatMap((smsEnabled) =>
  [true, false].flatMap((onboarding) =>
    [true, false].map((tireHotel) => ({ smsEnabled, onboarding, tireHotel }))
  )
)

describe('default dashboard layout', () => {
  it('places every card', () => {
    for (const id of DASHBOARD_CARD_IDS) {
      expect(DEFAULT_LAYOUT.cards[id], `${id} has no default position`).toBeDefined()
    }
  })

  it('keeps every card inside the grid', () => {
    for (const id of DASHBOARD_CARD_IDS) {
      const card = DEFAULT_LAYOUT.cards[id]
      expect(card.x).toBeGreaterThanOrEqual(0)
      expect(card.x + card.w, `${id} runs past the last column`).toBeLessThanOrEqual(GRID_COLS)
    }
  })

  it.each(CONFIGS)('never overlaps two visible cards (%o)', (config) => {
    const visible = visibleFor(config)
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = DEFAULT_LAYOUT.cards[visible[i]]
        const b = DEFAULT_LAYOUT.cards[visible[j]]
        expect(
          overlaps(a, b),
          `${visible[i]} overlaps ${visible[j]} when ${JSON.stringify(config)}`
        ).toBe(false)
      }
    }
  })

  it('lets sms and notifications share one slot', () => {
    // They are mutually exclusive, so a column each would leave the right
    // column permanently one card short and split every pair below it.
    expect(DEFAULT_LAYOUT.cards.sms).toEqual(DEFAULT_LAYOUT.cards.notifications)
  })

  it.each(CONFIGS)('pairs off every half card but the last (%o)', (config) => {
    const visible = visibleFor(config)
    const halves = visible.filter((id) => DEFAULT_LAYOUT.cards[id].w === GRID_COLS / 2)

    // Count halves per row, treating the shared sms/notifications slot as the
    // single card it renders as.
    const perRow = new Map<number, number>()
    for (const id of halves) {
      const { y } = DEFAULT_LAYOUT.cards[id]
      perRow.set(y, (perRow.get(y) ?? 0) + 1)
    }

    const lonely = [...perRow.entries()].filter(([, count]) => count === 1)
    const lastRow = Math.max(...halves.map((id) => DEFAULT_LAYOUT.cards[id].y))

    for (const [row] of lonely) {
      expect(row, `a half card sits alone on row ${row}, leaving a hole beside it`).toBe(lastRow)
    }
  })
})

/**
 * Moving a default is the one thing that reaches past a saved layout, so it
 * has to reach exactly as far as intended: the card that moved, and nothing
 * else the user put where they wanted it.
 */
describe('moved defaults', () => {
  const somewhereElse: CardLayout = { x: 0, y: 34, w: 6, h: 5 }

  it('lands the moved card above the one it belongs above', () => {
    // recentCompleted moved up by hand, well above the tire hotel's own
    // default row: an absolute row would drop the card below it.
    const layout = normalizeLayout({
      version: 1,
      hidden: [],
      cards: {
        tireHotel: somewhereElse,
        recentCompleted: { x: 0, y: 8, w: 12, h: 5 },
      },
    })

    const tireHotel = layout.cards.tireHotel
    expect(tireHotel.x).toBe(6)
    expect(tireHotel.y + tireHotel.h).toBeLessThanOrEqual(layout.cards.recentCompleted.y)
  })

  it('overlaps nothing after making room for the moved card', () => {
    const layout = normalizeLayout({
      version: 1,
      hidden: [],
      cards: { tireHotel: somewhereElse },
    })

    const ids = DASHBOARD_CARD_IDS.filter((id) => id !== 'notifications')
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(
          overlaps(layout.cards[ids[i]], layout.cards[ids[j]]),
          `${ids[i]} overlaps ${ids[j]} after the migration`
        ).toBe(false)
      }
    }
  })

  it('keeps a stored position saved since the card moved', () => {
    const layout = normalizeLayout({
      version: LAYOUT_VERSION,
      hidden: [],
      cards: { tireHotel: somewhereElse },
    })

    expect(layout.cards.tireHotel).toEqual(somewhereElse)
  })

  it('leaves every other card where the user put it', () => {
    const layout = normalizeLayout({
      version: 1,
      hidden: [],
      cards: { reminders: somewhereElse, activeJobs: { x: 0, y: 0, w: 12, h: 6 } },
    })

    expect(layout.cards.reminders).toEqual(somewhereElse)
    expect(layout.cards.activeJobs).toEqual({ x: 0, y: 0, w: 12, h: 6 })
  })

  it('stamps the current version so the move happens once', () => {
    expect(normalizeLayout({ version: 1, hidden: [], cards: {} }).version).toBe(LAYOUT_VERSION)
  })
})
