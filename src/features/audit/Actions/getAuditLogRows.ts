'use server'

import { z } from 'zod'
import {
  AUDIT_LOG_BATCH_SIZE,
  AUDIT_LOG_SORT,
  auditLogFilterOptions,
  auditLogListInclude,
  auditLogListWhere,
} from '@/features/audit/Lib/auditLogList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  action: z.string().max(100).optional(),
  entity: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the audit log, newest first. The first (no cursor) also carries
 * the total and what the filter dropdowns offer; the rest carry rows only.
 */
export async function getAuditLogRows(input: z.input<typeof inputSchema>) {
  return withAuth(async ({ organizationId }) => {
    const params = inputSchema.parse(input)
    const where = auditLogListWhere(organizationId, params)
    const first = !params.cursor
    const batchWhere = params.cursor
      ? { AND: [where, keysetAfter(AUDIT_LOG_SORT, params.cursor)] }
      : where

    const [found, total, filters] = await Promise.all([
      db.auditLog.findMany({
        where: batchWhere,
        include: auditLogListInclude,
        orderBy: keysetOrderBy(AUDIT_LOG_SORT),
        // One more than a batch says whether there is anything after it.
        take: AUDIT_LOG_BATCH_SIZE + 1,
      }),
      first ? db.auditLog.count({ where }) : null,
      first ? auditLogFilterOptions(organizationId) : null,
    ])

    const rows = found.slice(0, AUDIT_LOG_BATCH_SIZE)
    const last = rows[rows.length - 1]
    const nextCursor =
      found.length > AUDIT_LOG_BATCH_SIZE && last ? keysetCursor(AUDIT_LOG_SORT, last) : null

    return {
      rows,
      nextCursor,
      total: total ?? undefined,
      filters: filters ?? undefined,
    }
  })
}
