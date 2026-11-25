import 'server-only'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'
import type { UserSortField } from '../Schema/adminSchema'

/**
 * The platform's user list, for super admins: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * always continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const ADMIN_USER_BATCH_SIZE = 50

export function adminUserListWhere(search?: string) {
  const q = search?.trim()
  if (!q) return {}
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' as const } },
      { email: { contains: q, mode: 'insensitive' as const } },
    ],
  }
}

/**
 * A yes/no column as a keyset part. lib/keyset.ts reads strings, numbers and
 * dates; here a cursor carries 1 for true and 0 for false, and Postgres sorts
 * false before true.
 */
function booleanColumn(column: string, dir: 'asc' | 'desc'): KeysetPart {
  const never = { AND: [{ [column]: true }, { [column]: false }] }
  return {
    dir,
    nulls: dir === 'asc' ? 'last' : 'first',
    kind: 'number',
    canBeEmpty: false,
    read: (row) => ((row as Record<string, unknown>)[column] ? 1 : 0),
    orderBy: () => ({ [column]: dir }),
    compare: (op, value) => {
      const on = value === 1
      if (op === 'equals') return { [column]: on }
      // Only false has anything above it, and only true anything below.
      if (op === 'gt') return on ? never : { [column]: true }
      return on ? { [column]: false } : never
    },
    isNull: () => never,
    notNull: () => ({}),
  }
}

/**
 * What the list is sorted by. Last seen puts accounts that never signed in at
 * the end either way round, so the people actually using the platform come
 * first. The id breaks the last tie (lib/keyset.ts adds it).
 */
export function adminUserListSort(sortBy: UserSortField, sortOrder: 'asc' | 'desc'): KeysetPart[] {
  switch (sortBy) {
    case 'name':
      return [keysetColumn(['name'], sortOrder, 'string')]
    case 'email':
      return [keysetColumn(['email'], sortOrder, 'string')]
    case 'createdAt':
      return [keysetColumn(['createdAt'], sortOrder, 'date')]
    case 'isSuperAdmin':
      return [booleanColumn('isSuperAdmin', sortOrder)]
    default:
      return [keysetColumn(['lastSeen'], sortOrder, 'date', { nullable: true, nulls: 'last' })]
  }
}

export const adminUserListSelect = {
  id: true,
  name: true,
  email: true,
  isSuperAdmin: true,
  createdAt: true,
  lastSeen: true,
  emailVerified: true,
} as const
