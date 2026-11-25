'use server'

import { z } from 'zod'
import {
  gatePoRequired,
  isCustomerReferenceEnabled,
} from '@/features/customer-reference/Lib/referenceSetting'
import {
  CUSTOMER_BATCH_SIZE,
  customerIdsByVehicleCount,
  customerListInclude,
  customerListSort,
  customerListWhere,
} from '@/features/customers/Lib/customerList.server'
import { db } from '@/lib/db'
import { type Cursor, cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { inIdOrder } from '@/lib/keyset-count'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the customer list. The first (no cursor) also carries the
 * total; the rest carry rows only.
 */
export async function getCustomerRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = customerListWhere(organizationId, params)
      const sort = customerListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor

      const [batch, total, referenceOn] = await Promise.all([
        (async () => {
          if (sort.kind === 'keyset') {
            const batchWhere = params.cursor
              ? { AND: [where, keysetAfter(sort.parts, params.cursor)] }
              : where
            const found = await db.customer.findMany({
              where: batchWhere,
              include: customerListInclude,
              orderBy: keysetOrderBy(sort.parts),
              // One more than a batch says whether there is anything after it.
              take: CUSTOMER_BATCH_SIZE + 1,
            })
            const rows = found.slice(0, CUSTOMER_BATCH_SIZE)
            const last = rows[rows.length - 1]
            const nextCursor: Cursor | null =
              found.length > CUSTOMER_BATCH_SIZE && last ? keysetCursor(sort.parts, last) : null
            return { rows, nextCursor }
          }

          // By vehicle count: the customers the search finds, ordered and
          // cut after the cursor by Postgres, then loaded in that order.
          const matching = await db.customer.findMany({ where, select: { id: true } })
          const ordered = await customerIdsByVehicleCount(
            organizationId,
            matching.map((customer) => customer.id),
            sort.dir,
            params.cursor,
            CUSTOMER_BATCH_SIZE + 1
          )
          const page = ordered.slice(0, CUSTOMER_BATCH_SIZE)
          const ids = page.map((entry) => entry.id)
          const loaded = ids.length
            ? await db.customer.findMany({
                where: { organizationId, id: { in: ids } },
                include: customerListInclude,
              })
            : []
          const last = page[page.length - 1]
          const nextCursor: Cursor | null =
            ordered.length > CUSTOMER_BATCH_SIZE && last ? { v: [last.count], id: last.id } : null
          return { rows: inIdOrder(ids, loaded), nextCursor }
        })(),
        first ? db.customer.count({ where }) : null,
        isCustomerReferenceEnabled(organizationId),
      ])
      const { rows, nextCursor } = batch

      return {
        rows: rows.map((customer) => gatePoRequired(customer, referenceOn)),
        nextCursor,
        total: total ?? undefined,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
