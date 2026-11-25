'use server'

import { z } from 'zod'
import {
  OBSERVATION_BATCH_SIZE,
  observationListInclude,
  observationListSort,
  observationListWhere,
} from '@/features/vehicles/Lib/observationList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  severity: z.string().max(50).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the observations list. The first (no cursor) also carries the
 * total; the rest carry rows only.
 */
export async function getObservationRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = await observationListWhere(organizationId, params)
      const sort = observationListSort
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total] = await Promise.all([
        db.vehicleFinding.findMany({
          where: batchWhere,
          include: observationListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: OBSERVATION_BATCH_SIZE + 1,
        }),
        first ? db.vehicleFinding.count({ where }) : null,
      ])

      const rows = found.slice(0, OBSERVATION_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > OBSERVATION_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return { rows, nextCursor, total: total ?? undefined }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
