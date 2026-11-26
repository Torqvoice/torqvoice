'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { withSuperAdmin } from '@/lib/with-super-admin'
import {
  ADMIN_ORGANIZATION_BATCH_SIZE,
  ADMIN_ORGANIZATION_SORT,
  adminOrganizationListSelect,
  adminOrganizationListWhere,
} from '../Lib/adminOrganizationList.server'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of every workshop on the platform, newest first, for super
 * admins. Only the first (no cursor) carries the total.
 */
export async function getOrganizationRows(input?: z.input<typeof inputSchema>) {
  return withSuperAdmin(async () => {
    const params = inputSchema.parse(input ?? {})
    const where = adminOrganizationListWhere(params.search)
    const batchWhere = params.cursor
      ? { AND: [where, keysetAfter(ADMIN_ORGANIZATION_SORT, params.cursor)] }
      : where

    const [found, total] = await Promise.all([
      db.organization.findMany({
        where: batchWhere,
        select: adminOrganizationListSelect,
        orderBy: keysetOrderBy(ADMIN_ORGANIZATION_SORT),
        // One more than a batch says whether there is anything after it.
        take: ADMIN_ORGANIZATION_BATCH_SIZE + 1,
      }),
      params.cursor ? null : db.organization.count({ where }),
    ])

    const organizations = found.slice(0, ADMIN_ORGANIZATION_BATCH_SIZE)
    const last = organizations[organizations.length - 1]
    const nextCursor =
      found.length > ADMIN_ORGANIZATION_BATCH_SIZE && last
        ? keysetCursor(ADMIN_ORGANIZATION_SORT, last)
        : null

    const ownerUserIds = organizations.flatMap((o) => o.members.map((m) => m.userId))
    const owners =
      ownerUserIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: ownerUserIds } },
            select: { id: true, name: true, email: true },
          })
        : []
    const ownerMap = new Map(owners.map((o) => [o.id, o]))

    return {
      rows: organizations.map((o) => {
        const ownerMember = o.members[0]
        const owner = ownerMember ? ownerMap.get(ownerMember.userId) : null
        return {
          id: o.id,
          name: o.name,
          createdAt: o.createdAt.toISOString(),
          memberCount: o._count.members,
          ownerName: owner?.name ?? 'N/A',
          ownerEmail: owner?.email ?? 'N/A',
          subscriptionStatus: o.subscription?.status ?? null,
          subscriptionPlan: o.subscription?.plan?.name ?? null,
        }
      }),
      nextCursor,
      total: total ?? undefined,
    }
  })
}
