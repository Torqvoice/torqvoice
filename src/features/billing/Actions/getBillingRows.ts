'use server'

import { z } from 'zod'
import {
  BILLING_BATCH_SIZE,
  type BillingTotals,
  billingBaseSql,
  billingCursor,
  billingDateRangeSql,
  billingGroupBy,
  billingGroupKeySql,
  billingKeysetAfter,
  billingListConditions,
  billingListSort,
  billingOrderBySql,
  billingRowFromSql,
  billingRowGroupKey,
  billingSortKeysSql,
  billingTotalsFromSql,
  billingTotalsSelectSql,
  keyConditionSql,
} from '@/features/billing/Lib/billingList.server'
import { billingListInputSchema } from '@/features/billing/Schema/billingListSchema'
import { getBillingSummary } from '@/features/billing/Lib/billingSummary.server'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { cursorSchema } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { workshopTimeZone } from '@/lib/workshop-timezone'

const inputSchema = billingListInputSchema.extend({
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

type BatchRow = Parameters<typeof billingRowFromSql>[0] & Record<string, unknown>
type TotalsRow = { cnt: bigint; invoiced: unknown; paid: unknown }

/**
 * One batch of the billing list. The first (no cursor) also carries the total
 * and the summary the cards and tabs show; the rest carry rows only, since
 * counting the whole list again for every batch would buy nothing.
 *
 * Grouped, every batch also carries the subtotals of the groups its rows fall
 * in, over the whole filter rather than the rows loaded so far, so a group's
 * heading shows what it really adds up to.
 */
export async function getBillingRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const timeZone = await workshopTimeZone(organizationId)
      const groupBy = billingGroupBy(params.groupBy)
      const sort = billingListSort(params.sortBy, params.sortOrder, groupBy)
      const first = !params.cursor
      const cond = billingListConditions(params, timeZone)
      const base = billingBaseSql(organizationId, cond, timeZone)
      const after = params.cursor
        ? Prisma.sql`AND ${keyConditionSql(sort, billingKeysetAfter(sort, params.cursor))}`
        : Prisma.empty

      const totalsQuery = first
        ? db.$queryRaw<TotalsRow[]>(Prisma.sql`
          SELECT ${billingTotalsSelectSql} FROM (${base}) sub
          WHERE 1=1 ${cond.status} ${cond.delivery}
        `)
        : null

      const rowsQuery = db.$queryRaw<BatchRow[]>(Prisma.sql`
        SELECT sub.*, ${billingSortKeysSql(sort)}
        FROM (${base}) sub
        WHERE 1=1 ${cond.status} ${cond.delivery} ${after}
        ORDER BY ${billingOrderBySql(sort)}
        LIMIT ${BILLING_BATCH_SIZE + 1}
      `)

      const [found, totalsRows, summary] = await Promise.all([
        rowsQuery,
        totalsQuery,
        first ? getBillingSummary(organizationId, billingDateRangeSql(params, timeZone)) : null,
      ])

      const rows = found.slice(0, BILLING_BATCH_SIZE).map(billingRowFromSql)
      const last = found[Math.min(found.length, BILLING_BATCH_SIZE) - 1]
      const nextCursor =
        found.length > BILLING_BATCH_SIZE && last ? billingCursor(sort, last) : null

      let groups: Record<string, BillingTotals> | undefined
      if (groupBy && rows.length > 0) {
        const keys = [...new Set(rows.map((row) => billingRowGroupKey(row, groupBy)))]
        const key = billingGroupKeySql(groupBy)
        const groupRows = await db.$queryRaw<(TotalsRow & { group_key: string })[]>(Prisma.sql`
          SELECT ${key} AS group_key, ${billingTotalsSelectSql}
          FROM (${base}) sub
          WHERE 1=1 ${cond.status} ${cond.delivery} AND ${key} IN (${Prisma.join(keys)})
          GROUP BY 1
        `)
        groups = Object.fromEntries(
          groupRows.map((g) => [g.group_key ?? '', billingTotalsFromSql(g)])
        )
      }

      const totals = totalsRows ? billingTotalsFromSql(totalsRows[0]) : undefined
      return {
        rows,
        nextCursor,
        total: totals?.count,
        totals,
        groups,
        summary: summary ?? undefined,
      }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] }
  )
}
