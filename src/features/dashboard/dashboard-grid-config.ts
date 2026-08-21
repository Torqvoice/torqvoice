/**
 * Dashboard grid model: a 12-column grid where every card has a position and
 * size, persisted per user (User.dashboardLayout). The default mirrors the
 * pre-grid dashboard: two columns of cards with two full-width rows.
 */

export const DASHBOARD_CARD_IDS = [
  'gettingStarted',
  'maintenance',
  'reminders',
  'sms',
  'notifications',
  'inspections',
  'quoteRequests',
  'quoteResponses',
  'recentCompleted',
  'activeJobs',
  'recentActivity',
  'recentObservations',
  'tireHotel',
] as const

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number]

export interface CardLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardLayout {
  version: 1
  /** Hidden card ids: built-in ids or custom:<widgetId> */
  hidden: string[]
  /** Positions keyed by built-in id or custom:<widgetId> */
  cards: Record<string, CardLayout>
}

export const GRID_COLS = 12
export const GRID_ROW_HEIGHT = 84
export const GRID_MARGIN: [number, number] = [16, 16]
export const CARD_MIN_W = 3
export const CARD_MIN_H = 3

/**
 * Height a card is drawn at while it has nothing to show. A card keeps its
 * grid tile whether or not it has rows, so an empty one used to reserve its
 * full configured height for a single line of grey text. Collapsing to the
 * minimum keeps the dashboard from being mostly blank on a quiet day; the
 * user's stored height is untouched and comes back with the first row.
 */
export const COLLAPSED_CARD_H = CARD_MIN_H

/** Pixel height of `h` grid rows, margins between them included. */
export function gridHeightPx(h: number): number {
  return h * GRID_ROW_HEIGHT + (h - 1) * GRID_MARGIN[1]
}

const half = (x: 0 | 6, row: number, h = 5): CardLayout => ({ x, y: row, w: 6, h })
const full = (row: number, h = 5): CardLayout => ({ x: 0, y: row, w: 12, h })

/**
 * Two columns of half cards over two full-width rows.
 *
 * Compaction is vertical and per-column, so a half card with no partner
 * leaves a visible hole beside it rather than closing up. That makes the
 * pairing load-bearing: every row below needs an even number of halves above
 * it, or the columns drift out of step and the gap lands somewhere different
 * on every dashboard.
 *
 * `sms` and `notifications` are the case that breaks a naive layout. Exactly
 * one of them is ever available, so giving them a column each leaves the
 * right column permanently one card short and every later pair splits. They
 * share the one slot here instead, since only one is ever rendered and they
 * cannot collide, and `inspections` takes the partner position.
 */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  hidden: [],
  cards: {
    // First-run checklist leads the grid; rows compact upward once it is
    // gone (dismissed or not offered), so established users see no hole.
    gettingStarted: full(0, 4),
    // Both are short lists by nature, so the row starts a notch under the
    // five-row default. They move together: a half card whose partner is a
    // different height leaves the two columns out of step for every row
    // below it.
    maintenance: half(0, 4, 4),
    reminders: half(6, 4, 4),
    // One slot, two candidates.
    sms: half(0, 9),
    notifications: half(0, 9),
    inspections: half(6, 9),
    quoteRequests: half(0, 14),
    quoteResponses: half(6, 14),
    recentActivity: half(0, 19),
    recentObservations: half(6, 19),
    recentCompleted: full(24),
    activeJobs: full(29),
    // Opt-in, and the odd card out when it is on: last, where a lone half is
    // least disruptive. Hidden entirely when the module is off, so a shop
    // without it never reserves the slot.
    tireHotel: half(0, 34),
  },
}

function isCardLayout(v: unknown): v is CardLayout {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (['x', 'y', 'w', 'h'] as const).every(
    (k) => typeof c[k] === 'number' && Number.isFinite(c[k] as number)
  )
}

function clampCard(stored: CardLayout): CardLayout {
  return {
    x: Math.max(0, Math.min(GRID_COLS - CARD_MIN_W, Math.round(stored.x))),
    y: Math.max(0, Math.round(stored.y)),
    w: Math.max(CARD_MIN_W, Math.min(GRID_COLS, Math.round(stored.w))),
    h: Math.max(CARD_MIN_H, Math.min(40, Math.round(stored.h))),
  }
}

/** A default spot for a card with no stored position: full row at the bottom */
export function placeAtBottom(cards: Record<string, CardLayout>): CardLayout {
  const bottom = Object.values(cards).reduce((max, c) => Math.max(max, c.y + c.h), 0)
  return { x: 0, y: bottom, w: 6, h: 5 }
}

/**
 * Merges a stored layout with the defaults: unknown card ids are dropped,
 * missing cards (added after the user saved) fall back to their default
 * position, and malformed values reset. `customIds` are the currently
 * existing custom:<widgetId> card ids; stored entries for deleted widgets
 * are discarded, and new widgets get a spot at the bottom. Never throws.
 */
export function normalizeLayout(raw: unknown, customIds: string[] = []): DashboardLayout {
  const result: DashboardLayout = {
    version: 1,
    hidden: [],
    cards: { ...DEFAULT_LAYOUT.cards },
  }
  const knownIds = new Set<string>([...DASHBOARD_CARD_IDS, ...customIds])
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  if (Array.isArray(data.hidden)) {
    result.hidden = data.hidden.filter(
      (id): id is string => typeof id === 'string' && knownIds.has(id)
    )
  }

  const cards =
    data.cards && typeof data.cards === 'object' ? (data.cards as Record<string, unknown>) : {}
  for (const id of DASHBOARD_CARD_IDS) {
    const stored = cards[id]
    if (isCardLayout(stored)) result.cards[id] = clampCard(stored)
  }
  for (const id of customIds) {
    const stored = cards[id]
    result.cards[id] = isCardLayout(stored) ? clampCard(stored) : placeAtBottom(result.cards)
  }

  return result
}
