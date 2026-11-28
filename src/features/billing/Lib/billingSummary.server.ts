import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'

export interface BillingSummary {
  totalRevenue: number
  totalPaid: number
  outstanding: number
  paidCount: number
  unpaidCount: number
  partialCount: number
}

/**
 * The cards and tab counts over the billing list: every invoice the workshop
 * has, or those in the date range the list is showing (`range`, a condition
 * over `sr` from billingDateRangeSql).
 */
export async function getBillingSummary(
  organizationId: string,
  range: Prisma.Sql = Prisma.empty
): Promise<BillingSummary> {
  // A cancelled invoice was never charged: it is out of revenue, of what is
  // owed and of the paid / partial / unpaid counts. The money that moved on
  // it is real, though, so collected keeps what the workshop kept of it:
  // what came in (in full, for one marked paid by hand) less any refund.
  const rows = await db.$queryRaw<
    {
      total_revenue: number
      total_paid: number
      live_paid: number
      paid_count: bigint
      unpaid_count: bigint
      partial_count: bigint
    }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(sub.charged) FILTER (WHERE NOT sub.cancelled), 0) AS total_revenue,
      COALESCE(SUM(sub.paid), 0) AS total_paid,
      COALESCE(SUM(sub.paid) FILTER (WHERE NOT sub.cancelled), 0) AS live_paid,
      COUNT(*) FILTER (WHERE NOT sub.cancelled AND (sub."manuallyPaid" = true OR (sub.paid >= sub.charged AND sub.charged > 0))) AS paid_count,
      COUNT(*) FILTER (WHERE NOT sub.cancelled AND sub."manuallyPaid" = false AND sub.paid > 0 AND sub.paid < sub.charged) AS partial_count,
      COUNT(*) FILTER (WHERE NOT sub.cancelled AND sub."manuallyPaid" = false AND sub.paid = 0) AS unpaid_count
    FROM (
      SELECT
        sr."manuallyPaid",
        sr.status = 'cancelled' AS cancelled,
        CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END AS charged,
        CASE
          WHEN sr.status = 'cancelled' THEN
            CASE WHEN sr."manuallyPaid" = true
              THEN GREATEST(
                COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id AND p.amount > 0), 0),
                CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
              )
              ELSE COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id AND p.amount > 0), 0)
            END
            + COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id AND p.amount < 0), 0)
          WHEN sr."manuallyPaid" = true
            THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
          ELSE COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id), 0)
        END AS paid
      FROM "public"."service_records" sr
      WHERE sr."organizationId" = ${organizationId}
      ${range}
    ) sub
  `)

  const row = rows[0]
  const totalRevenue = Number(row?.total_revenue ?? 0)
  const totalPaid = Number(row?.total_paid ?? 0)
  const livePaid = Number(row?.live_paid ?? row?.total_paid ?? 0)

  return {
    totalRevenue,
    totalPaid,
    outstanding: totalRevenue - livePaid,
    paidCount: Number(row?.paid_count ?? 0),
    unpaidCount: Number(row?.unpaid_count ?? 0),
    partialCount: Number(row?.partial_count ?? 0),
  }
}
