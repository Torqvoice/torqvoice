import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The audit log's query, in one place: the page's first batch and every batch
 * loaded while scrolling are built here, so the rows that arrive later always
 * continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const AUDIT_LOG_BATCH_SIZE = 50

export type AuditLogListFilters = {
  search?: string
  action?: string
  entity?: string
  userId?: string
}

export function auditLogListWhere(organizationId: string, params: AuditLogListFilters) {
  const where: Prisma.AuditLogWhereInput = { organizationId }

  if (params.search) {
    where.OR = [
      { action: { contains: params.search, mode: 'insensitive' } },
      { entity: { contains: params.search, mode: 'insensitive' } },
      { message: { contains: params.search, mode: 'insensitive' } },
      { entityId: { contains: params.search, mode: 'insensitive' } },
      { user: { name: { contains: params.search, mode: 'insensitive' } } },
      { user: { email: { contains: params.search, mode: 'insensitive' } } },
    ]
  }
  if (params.action && params.action !== 'all') where.action = params.action
  if (params.entity && params.entity !== 'all') where.entity = params.entity
  if (params.userId && params.userId !== 'all') where.userId = params.userId

  return where
}

/** Newest first; the id breaks ties (lib/keyset.ts adds it). */
export const AUDIT_LOG_SORT: KeysetPart[] = [keysetColumn(['timestamp'], 'desc', 'date')]

export const auditLogListInclude = {
  user: { select: { id: true, name: true, email: true } },
} as const

/** What the filter dropdowns offer: every action, entity and person in the workshop's log. */
export async function auditLogFilterOptions(organizationId: string) {
  const [actionValues, entityValues, userValues] = await Promise.all([
    db.auditLog.findMany({
      where: { organizationId },
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    }),
    db.auditLog.findMany({
      where: { organizationId, entity: { not: null } },
      select: { entity: true },
      distinct: ['entity'],
      orderBy: { entity: 'asc' },
    }),
    db.auditLog.findMany({
      where: { organizationId, userId: { not: null } },
      select: { userId: true, user: { select: { name: true, email: true } } },
      distinct: ['userId'],
    }),
  ])

  return {
    actions: actionValues.map((a) => a.action),
    entities: entityValues.map((e) => e.entity).filter((e): e is string => Boolean(e)),
    users: userValues
      .filter((u) => u.userId && u.user)
      .map((u) => ({
        id: u.userId as string,
        name: u.user?.name ?? null,
        email: u.user?.email ?? null,
      })),
  }
}
