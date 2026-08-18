/**
 * Dashboard grid model: a 12-column grid where every card has a position and
 * size, persisted per user (User.dashboardLayout). The default mirrors the
 * pre-grid dashboard: two columns of cards with two full-width rows.
 */

export const DASHBOARD_CARD_IDS = [
  "gettingStarted",
  "maintenance",
  "reminders",
  "sms",
  "notifications",
  "inspections",
  "quoteRequests",
  "quoteResponses",
  "recentCompleted",
  "activeJobs",
  "recentActivity",
  "recentObservations",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

export interface CardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  version: 1;
  /** Hidden card ids: built-in ids or custom:<widgetId> */
  hidden: string[];
  /** Positions keyed by built-in id or custom:<widgetId> */
  cards: Record<string, CardLayout>;
}

export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 84;
export const GRID_MARGIN: [number, number] = [16, 16];
export const CARD_MIN_W = 3;
export const CARD_MIN_H = 3;

const half = (x: 0 | 6, row: number, h = 5): CardLayout => ({ x, y: row, w: 6, h });
const full = (row: number, h = 5): CardLayout => ({ x: 0, y: row, w: 12, h });

/** Mirrors the original two-column dashboard order. Rows compact vertically,
 *  so hidden cards (e.g. sms vs notifications) leave no holes. */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  hidden: [],
  cards: {
    // First-run checklist leads the grid; rows compact upward once it is
    // gone (dismissed or not offered), so established users see no hole.
    gettingStarted: full(0, 4),
    maintenance: half(0, 4),
    reminders: half(6, 4),
    sms: half(0, 9),
    notifications: half(6, 9),
    inspections: half(0, 14),
    quoteRequests: half(6, 14),
    quoteResponses: half(0, 19),
    recentCompleted: full(24),
    activeJobs: full(29),
    recentActivity: half(0, 34),
    recentObservations: half(6, 34),
  },
};

function isCardLayout(v: unknown): v is CardLayout {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof c[k] === "number" && Number.isFinite(c[k] as number)
  );
}

function clampCard(stored: CardLayout): CardLayout {
  return {
    x: Math.max(0, Math.min(GRID_COLS - CARD_MIN_W, Math.round(stored.x))),
    y: Math.max(0, Math.round(stored.y)),
    w: Math.max(CARD_MIN_W, Math.min(GRID_COLS, Math.round(stored.w))),
    h: Math.max(CARD_MIN_H, Math.min(40, Math.round(stored.h))),
  };
}

/** A default spot for a card with no stored position: full row at the bottom */
export function placeAtBottom(cards: Record<string, CardLayout>): CardLayout {
  const bottom = Object.values(cards).reduce((max, c) => Math.max(max, c.y + c.h), 0);
  return { x: 0, y: bottom, w: 6, h: 5 };
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
  };
  const knownIds = new Set<string>([...DASHBOARD_CARD_IDS, ...customIds]);
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (Array.isArray(data.hidden)) {
    result.hidden = data.hidden.filter(
      (id): id is string => typeof id === "string" && knownIds.has(id)
    );
  }

  const cards =
    data.cards && typeof data.cards === "object"
      ? (data.cards as Record<string, unknown>)
      : {};
  for (const id of DASHBOARD_CARD_IDS) {
    const stored = cards[id];
    if (isCardLayout(stored)) result.cards[id] = clampCard(stored);
  }
  for (const id of customIds) {
    const stored = cards[id];
    result.cards[id] = isCardLayout(stored) ? clampCard(stored) : placeAtBottom(result.cards);
  }

  return result;
}
