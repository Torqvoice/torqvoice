'use server'

import { z } from 'zod'
import { gateCustomerReference } from '@/features/customer-reference/Lib/referenceSetting'
import {
  QUOTE_BATCH_SIZE,
  quoteListInclude,
  quoteListSort,
  quoteListWhere,
} from '@/features/quotes/Lib/quoteList.server'
import { ATTENTION_STATUSES } from '@/features/quotes/Lib/quoteStatus'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the quote list. The first (no cursor) also carries the total
 * and the status counts the tabs show; the rest carry rows only.
 */
export async function getQuoteRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const { where, referenceOn } = await quoteListWhere(organizationId, params)
      const sort = quoteListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, statusCounts] = await Promise.all([
        db.quote.findMany({
          where: batchWhere,
          include: quoteListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: QUOTE_BATCH_SIZE + 1,
        }),
        first ? db.quote.count({ where }) : null,
        first
          ? db.quote.groupBy({ by: ['status'], where: { organizationId }, _count: true })
          : null,
      ])

      const rows = found.slice(0, QUOTE_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor = found.length > QUOTE_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      let counts: Record<string, number> | undefined
      if (statusCounts) {
        counts = {}
        for (const g of statusCounts) counts[g.status] = g._count
        counts.attention = ATTENTION_STATUSES.reduce(
          (sum, status) => sum + (counts?.[status] ?? 0),
          0
        )
      }

      return {
        rows: rows.map((record) => gateCustomerReference(record, referenceOn)),
        nextCursor,
        total: total ?? undefined,
        statusCounts: counts,
      }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] }
  )
}
