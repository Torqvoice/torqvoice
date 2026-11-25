'use server'

import { z } from 'zod'
import {
  gatePoRequired,
  isCustomerReferenceEnabled,
} from '@/features/customer-reference/Lib/referenceSetting'
import {
  CUSTOMER_BATCH_SIZE,
  customerListInclude,
  customerListSort,
  customerListWhere,
} from '@/features/customers/Lib/customerList.server'
import { db } from '@/lib/db'
import { type Cursor, cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
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

      // The sort by vehicle count pages by position: its cursor carries how
      // many rows came before it.
      let offset = 0
      if (sort.kind === 'offset' && params.cursor) {
        const [skip] = params.cursor.v
        if (
          params.cursor.v.length !== 1 ||
          typeof skip !== 'number' ||
          !Number.isInteger(skip) ||
          skip < 0
        ) {
          throw new Error('Invalid cursor')
        }
        offset = skip
      }
      const batchWhere =
        sort.kind === 'keyset' && params.cursor
          ? { AND: [where, keysetAfter(sort.parts, params.cursor)] }
          : where

      const [found, total, referenceOn] = await Promise.all([
        db.customer.findMany({
          where: batchWhere,
          include: customerListInclude,
          orderBy: sort.kind === 'keyset' ? keysetOrderBy(sort.parts) : sort.orderBy,
          ...(offset ? { skip: offset } : {}),
          // One more than a batch says whether there is anything after it.
          take: CUSTOMER_BATCH_SIZE + 1,
        }),
        first ? db.customer.count({ where }) : null,
        isCustomerReferenceEnabled(organizationId),
      ])

      const rows = found.slice(0, CUSTOMER_BATCH_SIZE)
      const last = rows[rows.length - 1]
      let nextCursor: Cursor | null = null
      if (found.length > CUSTOMER_BATCH_SIZE && last) {
        nextCursor =
          sort.kind === 'keyset'
            ? keysetCursor(sort.parts, last)
            : { v: [offset + rows.length], id: last.id }
      }

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
