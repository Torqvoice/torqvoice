/**
 * Dashboard grid model: a 12-column grid where every card has a position and
 * size, persisted per user (User.dashboardLayout). The default mirrors the
 * pre-grid dashboard: two columns of cards with two full-width rows.
 */

export const DASHBOARD_CARD_IDS = [
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
  hidden: DashboardCardId[];
  cards: Record<DashboardCardId, CardLayout>;
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
    maintenance: half(0, 0),
    reminders: half(6, 0),
    sms: half(0, 5),
    notifications: half(6, 5),
    inspections: half(0, 10),
    quoteRequests: half(6, 10),
    quoteResponses: half(0, 15),
    recentCompleted: full(20),
    activeJobs: full(25),
    recentActivity: half(0, 30),
    recentObservations: half(6, 30),
  },
};

function isCardLayout(v: unknown): v is CardLayout {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof c[k] === "number" && Number.isFinite(c[k] as number)
  );
}

/**
 * Merges a stored layout with the defaults: unknown card ids are dropped,
 * missing cards (added after the user saved) fall back to their default
 * position, and malformed values reset. Never throws.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const result: DashboardLayout = {
    version: 1,
    hidden: [],
    cards: { ...DEFAULT_LAYOUT.cards },
  };
  if (!raw || typeof raw !== "object") return result;
  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.hidden)) {
    result.hidden = data.hidden.filter((id): id is DashboardCardId =>
      (DASHBOARD_CARD_IDS as readonly string[]).includes(id as string)
    );
  }

  if (data.cards && typeof data.cards === "object") {
    const cards = data.cards as Record<string, unknown>;
    for (const id of DASHBOARD_CARD_IDS) {
      const stored = cards[id];
      if (isCardLayout(stored)) {
        result.cards[id] = {
          x: Math.max(0, Math.min(GRID_COLS - CARD_MIN_W, Math.round(stored.x))),
          y: Math.max(0, Math.round(stored.y)),
          w: Math.max(CARD_MIN_W, Math.min(GRID_COLS, Math.round(stored.w))),
          h: Math.max(CARD_MIN_H, Math.min(40, Math.round(stored.h))),
        };
      }
    }
  }

  return result;
}
