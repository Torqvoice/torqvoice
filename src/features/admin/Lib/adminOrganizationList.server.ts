import 'server-only'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The platform's workshop list, for super admins: the page's first batch and
 * every batch loaded while scrolling are built here, so the rows that arrive
 * later always continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const ADMIN_ORGANIZATION_BATCH_SIZE = 50

export function adminOrganizationListWhere(search?: string) {
  const q = search?.trim()
  return q ? { name: { contains: q, mode: 'insensitive' as const } } : {}
}

/** Newest first; the id breaks ties (lib/keyset.ts adds it). */
export const ADMIN_ORGANIZATION_SORT: KeysetPart[] = [keysetColumn(['createdAt'], 'desc', 'date')]

export const adminOrganizationListSelect = {
  id: true,
  name: true,
  createdAt: true,
  _count: { select: { members: true } },
  members: { where: { role: 'owner' }, take: 1, select: { userId: true } },
  subscription: { select: { status: true, plan: { select: { name: true } } } },
} as const
