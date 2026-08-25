/**
 * Block fills for the week timeline.
 *
 * A whole week of work is too much to read job by job, so colour carries the
 * status: the eye should find every job still waiting for parts without
 * reading a single label. The hues match the status badges used in the tables
 * (`src/lib/table-utils.ts`), at a fill strong enough to read as a solid block.
 */

const STATUS_BLOCK_COLORS: Record<string, string> = {
  pending: 'bg-yellow-400/80 text-yellow-950 dark:bg-yellow-600/70 dark:text-yellow-50',
  scheduled: 'bg-sky-400/80 text-sky-950 dark:bg-sky-600/70 dark:text-sky-50',
  'in-progress': 'bg-blue-400/80 text-blue-950 dark:bg-blue-600/70 dark:text-blue-50',
  'waiting-parts': 'bg-orange-400/80 text-orange-950 dark:bg-orange-600/70 dark:text-orange-50',
  completed: 'bg-emerald-400/80 text-emerald-950 dark:bg-emerald-600/70 dark:text-emerald-50',
  cancelled: 'bg-slate-300/80 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
}

const FALLBACK = 'bg-slate-400/80 text-slate-950 dark:bg-slate-600/70 dark:text-slate-50'

/** Inspections spell their statuses with underscores; work orders with dashes. */
export function normalizeStatus(status: string): string {
  return status.replace(/_/g, '-').toLowerCase()
}

export function statusBlockColor(status: string): string {
  return STATUS_BLOCK_COLORS[normalizeStatus(status)] ?? FALLBACK
}
