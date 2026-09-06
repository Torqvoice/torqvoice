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
  'serviceRequests',
  'quoteRequests',
  'quoteResponses',
  'recentCompleted',
  'activeJobs',
  'recentActivity',
  'recentObservations',
  'tireHotel',
  'inspectionsDue',
] as const

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number]

export interface CardLayout {
  x: number
  y: number
  w: number
  h: number
  /**
   * Set once the user has pulled this card's resize handle. Cards are
   * otherwise drawn only as tall as their content needs, which would
   * silently undo the height they just chose; a pinned card keeps `h`
   * exactly, empty or not.
   */
  pinH?: boolean
}

/**
 * Bumped when a card's default position moves and the new one should reach
 * people who already have a layout saved. `normalizeLayout` discards the
 * stored spot for the cards named in MOVED_AT and only for those, so
 * everything else the user arranged survives the migration.
 */
export const LAYOUT_VERSION = 2

export interface DashboardLayout {
  version: number
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
  version: LAYOUT_VERSION,
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
    // The two things customers ask for, side by side.
    serviceRequests: half(0, 14),
    quoteRequests: half(6, 14),
    quoteResponses: half(0, 19),
    recentActivity: half(6, 19),
    recentObservations: half(0, 24),
    // Opt-in, and the odd card out when it is on. It pairs with the
    // observations card here and sits above the full-width tables; with the
    // module off, observations is the lone half on the lowest half row,
    // which is the one place a hole is allowed. Hidden entirely when the
    // module is off, so a shop without it never reserves the slot.
    tireHotel: half(6, 24),
    // Full width so it never upsets the pairing above, and hidden entirely
    // until a registry has put an inspection date on at least one vehicle.
    inspectionsDue: full(29, 4),
    recentCompleted: full(34),
    activeJobs: full(39),
  },
}

/**
 * Cards whose default position moved, with the version that moved them and
 * where they should land in a layout the user has already arranged.
 *
 * The spot is worked out from that layout rather than copied from
 * DEFAULT_LAYOUT: an absolute row means nothing once the user has moved
 * things, and a card meant to sit above another can easily land below it.
 */
const MOVED: Partial<
  Record<
    DashboardCardId,
    { version: number; place: (cards: Record<string, CardLayout>) => CardLayout }
  >
> = {
  // Was bottom-left, under both full-width tables. Now the right column,
  // directly above the completed-work table wherever that has ended up.
  tireHotel: {
    version: 2,
    place: (cards) => ({
      x: 6,
      y: cards.recentCompleted.y,
      w: 6,
      h: DEFAULT_LAYOUT.cards.tireHotel.h,
    }),
  },
}

/**
 * Puts `card` at its spot in `cards`, pushing whatever starts at or below
 * that row down far enough to make room. Compaction closes the gap this
 * leaves beside it.
 */
function insertAt(cards: Record<string, CardLayout>, id: string, spot: CardLayout): void {
  for (const [otherId, other] of Object.entries(cards)) {
    if (otherId === id) continue
    if (other.y >= spot.y) cards[otherId] = { ...other, y: other.y + spot.h }
  }
  cards[id] = spot
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
    ...(stored.pinH === true ? { pinH: true as const } : {}),
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
 * position, cards whose default has moved since the layout was saved take
 * the new one, and malformed values reset. `customIds` are the currently
 * existing custom:<widgetId> card ids; stored entries for deleted widgets
 * are discarded, and new widgets get a spot at the bottom. Never throws.
 */
export function normalizeLayout(raw: unknown, customIds: string[] = []): DashboardLayout {
  const result: DashboardLayout = {
    version: LAYOUT_VERSION,
    hidden: [],
    cards: { ...DEFAULT_LAYOUT.cards },
  }
  const knownIds = new Set<string>([...DASHBOARD_CARD_IDS, ...customIds])
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const storedVersion = typeof data.version === 'number' ? data.version : 1

  if (Array.isArray(data.hidden)) {
    result.hidden = data.hidden.filter(
      (id): id is string => typeof id === 'string' && knownIds.has(id)
    )
  }

  const cards =
    data.cards && typeof data.cards === 'object' ? (data.cards as Record<string, unknown>) : {}
  const migrating: DashboardCardId[] = []
  for (const id of DASHBOARD_CARD_IDS) {
    const stored = cards[id]
    if (!isCardLayout(stored)) continue
    const moved = MOVED[id]
    // A layout saved before this card moved gives up the spot it was stored
    // in; one saved since is the user's own choice and is left alone. A
    // layout with no position for the card at all just takes the default.
    if (moved && storedVersion < moved.version) {
      migrating.push(id)
      continue
    }
    result.cards[id] = clampCard(stored)
  }
  // After every other card is back where the user left it, so a moved card
  // can be placed relative to them.
  for (const id of migrating) {
    const moved = MOVED[id]
    if (moved) insertAt(result.cards, id, moved.place(result.cards))
  }
  for (const id of customIds) {
    const stored = cards[id]
    result.cards[id] = isCardLayout(stored) ? clampCard(stored) : placeAtBottom(result.cards)
  }

  return result
}
