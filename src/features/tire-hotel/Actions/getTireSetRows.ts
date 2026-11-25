'use server'

import { z } from 'zod'
import { requireTireHotel } from '@/features/tire-hotel/Lib/tireHotelSettings'
import {
  TIRE_SET_BATCH_SIZE,
  tireSetListInclude,
  tireSetListSort,
  tireSetListWhere,
} from '@/features/tire-hotel/Lib/tireSetList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  season: z.string().max(50).optional(),
  warehouseId: z.string().max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the tire hotel list. The first (no cursor) also carries the
 * total and the counts the tabs show; the rest carry rows only.
 */
export async function getTireSetRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      await requireTireHotel(organizationId)
      const where = await tireSetListWhere(organizationId, params)
      const sort = tireSetListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, statusGroups, needsPrepCount] = await Promise.all([
        db.tireSet.findMany({
          where: batchWhere,
          include: tireSetListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: TIRE_SET_BATCH_SIZE + 1,
        }),
        first ? db.tireSet.count({ where }) : null,
        first
          ? db.tireSet.groupBy({
              by: ['status'],
              where: { organizationId },
              _count: { _all: true },
            })
          : null,
        first
          ? db.tireSet.count({
              // Matches the filter itself: a written-off set is not
              // outstanding work, so the badge must not count it either.
              where: {
                organizationId,
                status: { not: 'disposed' },
                treatments: { some: { status: 'pending' } },
              },
            })
          : null,
      ])

      const rows = found.slice(0, TIRE_SET_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > TIRE_SET_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      let statusCounts: Record<string, number> | undefined
      if (statusGroups) {
        statusCounts = {}
        for (const group of statusGroups) statusCounts[group.status] = group._count._all
        statusCounts.needs_prep = needsPrepCount ?? 0
      }

      return { rows, nextCursor, total: total ?? undefined, statusCounts }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL },
      ],
    }
  )
}
