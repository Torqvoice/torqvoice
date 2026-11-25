import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * A vehicle's notes, as its Notes tab lists them: the page's first batch and
 * every batch loaded while scrolling are built here, so the rows that arrive
 * later always continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const NOTE_BATCH_SIZE = 50

/** The vehicle's notes, and only while the vehicle is this workshop's. */
export function noteListWhere(organizationId: string, vehicleId: string) {
  return { vehicleId, vehicle: { organizationId } }
}

/** Matches no row: a cursor already past every row of one kind. */
const NONE = { id: { in: [] as string[] } }

/**
 * Pinned notes first. A yes/no has no order of its own in lib/keyset.ts, so
 * it travels in the cursor as 1 (pinned) or 0 and is compared as such.
 */
const pinnedFirst: KeysetPart = {
  dir: 'desc',
  nulls: 'last',
  kind: 'number',
  canBeEmpty: false,
  read: (row) => ((row as { isPinned?: boolean }).isPinned ? 1 : 0),
  orderBy: () => ({ isPinned: 'desc' }),
  compare: (op, value) => {
    const pinned = value === 1
    if (op === 'equals') return { isPinned: pinned }
    // After a pinned note come the unpinned ones; after an unpinned one, none.
    if (op === 'lt') return pinned ? { isPinned: false } : NONE
    return pinned ? NONE : { isPinned: true }
  },
  isNull: () => NONE,
  notNull: () => ({}),
}

/** Pinned first, then newest first; the id breaks the last tie (lib/keyset.ts). */
export function noteListSort(): KeysetPart[] {
  return [pinnedFirst, keysetColumn(['createdAt'], 'desc', 'date')]
}
