'use server'

import { z } from 'zod'
import {
  LABOR_PRESET_BATCH_SIZE,
  laborPresetListInclude,
  laborPresetListSort,
  laborPresetListWhere,
} from '@/features/labor-presets/Lib/laborPresetList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/** One batch of the labor packages list. Only the first (no cursor) carries the total. */
export async function getLaborPresetRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = laborPresetListWhere(organizationId, params.search)
      const sort = laborPresetListSort(params.sortBy, params.sortOrder)
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total] = await Promise.all([
        db.laborPreset.findMany({
          where: batchWhere,
          include: laborPresetListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: LABOR_PRESET_BATCH_SIZE + 1,
        }),
        params.cursor ? null : db.laborPreset.count({ where }),
      ])

      const rows = found.slice(0, LABOR_PRESET_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > LABOR_PRESET_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return { rows, nextCursor, total: total ?? undefined }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.LABOR_PRESETS },
      ],
    }
  )
}
