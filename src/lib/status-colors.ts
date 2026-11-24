/**
 * The colour of every work order, quote and inspection status, in one place.
 *
 * A status has one colour wherever it is shown: the lists, the dashboard, a
 * customer's page, a vehicle's page, the work board. Each screen used to keep
 * a table of its own, and they drifted: pending was yellow in one list, amber
 * in another and grey on the vehicle page. Screens draw a status with
 * `StatusBadge` (src/components/status-badge.tsx), which reads these tables,
 * and a test fails when a file outside this one maps a status to a colour.
 *
 * The text is the 700 shade on a light theme and the 400 on a dark one: the
 * 500s and 600s this used to carry were 2.7 to 3.6:1 on a light card, under
 * the 4.5:1 small text needs.
 *
 * `hue` is the colour's name in the palette; `badge` is the tinted pill the
 * lists use; the work board fills whole blocks with the same hue
 * (features/workboard/utils/job-colors.ts).
 */

interface StatusColor {
  hue: string
  /** Border, tint and text for a `Badge variant="outline"`. Written out so Tailwind sees every class. */
  badge: string
}

const yellow: StatusColor = {
  hue: 'yellow',
  badge: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
}
const sky: StatusColor = {
  hue: 'sky',
  badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
}
const blue: StatusColor = {
  hue: 'blue',
  badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
}
const orange: StatusColor = {
  hue: 'orange',
  badge: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
}
const emerald: StatusColor = {
  hue: 'emerald',
  badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
}
const gray: StatusColor = {
  hue: 'gray',
  badge: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
}
const slate: StatusColor = {
  hue: 'slate',
  badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
}
const red: StatusColor = {
  hue: 'red',
  badge: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
}
const amber: StatusColor = {
  hue: 'amber',
  badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
}
const purple: StatusColor = {
  hue: 'purple',
  badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
}

/**
 * A work order's stored status. Waiting to start is yellow, booked is sky,
 * work under way is blue, held for parts is orange, done is green, and a
 * cancelled invoice is slate, as the work board already drew it.
 */
export const WORK_ORDER_STATUS_COLORS: Record<string, StatusColor> = {
  pending: yellow,
  scheduled: sky,
  'in-progress': blue,
  'waiting-parts': orange,
  completed: emerald,
  // An invoice that went out and was called off: kept, quiet, and not live.
  cancelled: slate,
}

export const QUOTE_STATUS_COLORS: Record<string, StatusColor> = {
  draft: gray,
  sent: blue,
  changes_requested: orange,
  accepted: emerald,
  rejected: red,
  expired: amber,
  converted: purple,
}

export const INSPECTION_STATUS_COLORS: Record<string, StatusColor> = {
  'in-progress': blue,
  completed: emerald,
}

export type StatusKind = 'workOrder' | 'quote' | 'inspection'

const TABLES: Record<StatusKind, Record<string, StatusColor>> = {
  workOrder: WORK_ORDER_STATUS_COLORS,
  quote: QUOTE_STATUS_COLORS,
  inspection: INSPECTION_STATUS_COLORS,
}

/**
 * The colour for a stored status, or undefined for one nobody has given a
 * colour: a status the workshop added itself, or one newer than this table,
 * is drawn plain rather than as a guess.
 *
 * Work orders and inspections have been stored both hyphenated and with
 * underscores ("in-progress", "in_progress"); both find the same colour.
 * Quote statuses are underscored and are looked up as stored.
 */
export function statusColor(kind: StatusKind, status: string): StatusColor | undefined {
  const table = TABLES[kind]
  return table[status] ?? table[status.replace(/_/g, '-').toLowerCase()]
}

/** The badge classes for a status, or an empty string when it has no colour. */
export function statusBadgeClass(kind: StatusKind, status: string): string {
  return statusColor(kind, status)?.badge ?? ''
}
