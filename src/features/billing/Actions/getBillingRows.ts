'use server'

import { z } from 'zod'
import {
  BILLING_BATCH_SIZE,
  billingCursor,
  billingKeysetAfter,
  billingListConditions,
  billingListSort,
  billingOrderBySql,
  billingRowFromSql,
  billingSortKeysSql,
  keyConditionSql,
} from '@/features/billing/Lib/billingList.server'
import { getBillingSummary } from '@/features/billing/Lib/billingSummary.server'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { cursorSchema } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  delivery: z.string().max(20).optional(),
  completedOnly: z.boolean().optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

type BatchRow = Parameters<typeof billingRowFromSql>[0] & Record<string, unknown>

/**
 * One batch of the billing list. The first (no cursor) also carries the total
 * and the summary the cards and tabs show; the rest carry rows only, since
 * counting the whole list again for every batch would buy nothing.
 */
export async function getBillingRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const sort = billingListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const cond = billingListConditions(params)
      const after = params.cursor
        ? Prisma.sql`AND ${keyConditionSql(sort, billingKeysetAfter(sort, params.cursor))}`
        : Prisma.empty

      const countQuery = first
        ? db.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS cnt FROM (
            SELECT
              sr.id,
              sr."manuallyPaid" AS manually_paid,
              CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END AS effective_total,
              CASE WHEN sr."manuallyPaid" = true
                THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
                ELSE COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id), 0)
              END AS paid_amount,
              sr."sentAt" AS sent_at,
              sr."viewCount" AS view_count,
              sr.status AS job_status
            FROM "public"."service_records" sr
            LEFT JOIN "public"."vehicles" v ON v.id = sr."vehicleId"
            WHERE sr."organizationId" = ${organizationId}
            ${cond.search}
            ${cond.completed}
          ) sub
          WHERE 1=1 ${cond.status} ${cond.delivery}
        `)
        : null

      const rowsQuery = db.$queryRaw<BatchRow[]>(Prisma.sql`
        SELECT sub.*, ${billingSortKeysSql(sort)}
        FROM (
          SELECT
            sr.id,
            sr.title,
            sr."invoiceNumber",
            sr."serviceDate",
            sr."startDateTime",
            sr."invoiceDate",
            sr."manuallyPaid" AS manually_paid,
            CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END AS effective_total,
            CASE WHEN sr."manuallyPaid" = true
              THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
              ELSE COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id), 0)
            END AS paid_amount,
            v.id AS vehicle_id,
            v.make AS vehicle_make,
            v.model AS vehicle_model,
            v.year AS vehicle_year,
            v."licensePlate" AS vehicle_license_plate,
            c.id AS customer_id,
            c.name AS customer_name,
            sr."sentAt" AS sent_at,
            sr."viewCount" AS view_count,
            sr."lastViewedAt" AS last_viewed_at,
            sr.status AS job_status
          FROM "public"."service_records" sr
          LEFT JOIN "public"."vehicles" v ON v.id = sr."vehicleId"
          LEFT JOIN "public"."customers" c ON c.id = COALESCE(sr."customerId", v."customerId")
          WHERE sr."organizationId" = ${organizationId}
          ${cond.search}
          ${cond.completed}
        ) sub
        WHERE 1=1 ${cond.status} ${cond.delivery} ${after}
        ORDER BY ${billingOrderBySql(sort)}
        LIMIT ${BILLING_BATCH_SIZE + 1}
      `)

      const [found, countRows, summary] = await Promise.all([
        rowsQuery,
        countQuery,
        first ? getBillingSummary(organizationId) : null,
      ])

      const rows = found.slice(0, BILLING_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > BILLING_BATCH_SIZE && last ? billingCursor(sort, last) : null

      return {
        rows: rows.map(billingRowFromSql),
        nextCursor,
        total: countRows ? Number(countRows[0]?.cnt ?? 0) : undefined,
        summary: summary ?? undefined,
      }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] }
  )
}
