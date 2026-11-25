'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { withSuperAdmin } from '@/lib/with-super-admin'
import {
  ADMIN_USER_BATCH_SIZE,
  ADMIN_USER_DEFAULT_SORT,
  adminUserListSelect,
  adminUserListSort,
  adminUserListWhere,
} from '../Lib/adminUserList.server'
import { type UserSortField, userSortFields } from '../Schema/adminSchema'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of every account on the platform, for super admins. Only the
 * first (no cursor) carries the total.
 */
export async function getUserRows(input?: z.input<typeof inputSchema>) {
  return withSuperAdmin(async () => {
    const params = inputSchema.parse(input ?? {})
    const where = adminUserListWhere(params.search)
    // An unknown column (an old link, a hand-typed URL) is the default sort.
    const sortBy: UserSortField = userSortFields.includes(params.sortBy as UserSortField)
      ? (params.sortBy as UserSortField)
      : ADMIN_USER_DEFAULT_SORT
    const sort = adminUserListSort(sortBy, params.sortOrder ?? 'desc')
    const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

    const [found, total] = await Promise.all([
      db.user.findMany({
        where: batchWhere,
        select: adminUserListSelect,
        orderBy: keysetOrderBy(sort),
        // One more than a batch says whether there is anything after it.
        take: ADMIN_USER_BATCH_SIZE + 1,
      }),
      params.cursor ? null : db.user.count({ where }),
    ])

    const users = found.slice(0, ADMIN_USER_BATCH_SIZE)
    const last = users[users.length - 1]
    const nextCursor =
      found.length > ADMIN_USER_BATCH_SIZE && last ? keysetCursor(sort, last) : null

    const membershipCounts = users.length
      ? await db.organizationMember.groupBy({
          by: ['userId'],
          where: { userId: { in: users.map((u) => u.id) } },
          _count: true,
        })
      : []
    const countMap = new Map(membershipCounts.map((m) => [m.userId, m._count]))

    return {
      rows: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt.toISOString(),
        lastSeen: u.lastSeen?.toISOString() ?? null,
        emailVerified: u.emailVerified,
        organizationCount: countMap.get(u.id) ?? 0,
      })),
      nextCursor,
      total: total ?? undefined,
    }
  })
}
