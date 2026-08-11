"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client";

interface BillingSummary {
  totalRevenue: number;
  totalPaid: number;
  outstanding: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
}

async function getBillingSummary(organizationId: string): Promise<BillingSummary> {
  const rows = await db.$queryRaw<
    {
      total_revenue: number;
      total_paid: number;
      paid_count: bigint;
      unpaid_count: bigint;
      partial_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN sub.total > 0 THEN sub.total ELSE sub.cost END), 0) AS total_revenue,
      COALESCE(SUM(sub.paid), 0) AS total_paid,
      COUNT(*) FILTER (WHERE sub."manuallyPaid" = true OR (sub.paid >= (CASE WHEN sub.total > 0 THEN sub.total ELSE sub.cost END) AND (CASE WHEN sub.total > 0 THEN sub.total ELSE sub.cost END) > 0)) AS paid_count,
      COUNT(*) FILTER (WHERE sub."manuallyPaid" = false AND sub.paid > 0 AND sub.paid < (CASE WHEN sub.total > 0 THEN sub.total ELSE sub.cost END)) AS partial_count,
      COUNT(*) FILTER (WHERE sub."manuallyPaid" = false AND sub.paid = 0) AS unpaid_count
    FROM (
      SELECT
        sr."totalAmount" AS total,
        sr.cost,
        sr."manuallyPaid",
        CASE WHEN sr."manuallyPaid" = true
          THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
          ELSE COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."serviceRecordId" = sr.id), 0)
        END AS paid
      FROM service_records sr
      JOIN vehicles v ON v.id = sr."vehicleId"
      WHERE v."organizationId" = ${organizationId}
    ) sub
  `);

  const row = rows[0];
  const totalRevenue = Number(row?.total_revenue ?? 0);
  const totalPaid = Number(row?.total_paid ?? 0);

  return {
    totalRevenue,
    totalPaid,
    outstanding: totalRevenue - totalPaid,
    paidCount: Number(row?.paid_count ?? 0),
    unpaidCount: Number(row?.unpaid_count ?? 0),
    partialCount: Number(row?.partial_count ?? 0),
  };
}

export async function getBillingHistory(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const summary = await getBillingSummary(organizationId);

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { vehicle: { organizationId } };

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { invoiceNumber: { contains: params.search, mode: "insensitive" } },
        { vehicle: { make: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { model: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    // When filtering by payment status, use raw SQL for efficiency
    if (params.status === "paid" || params.status === "partial" || params.status === "unpaid") {
      const searchCondition = params.search
        ? Prisma.sql`AND (
            sr.title ILIKE ${`%${params.search}%`}
            OR sr."invoiceNumber" ILIKE ${`%${params.search}%`}
            OR v.make ILIKE ${`%${params.search}%`}
            OR v.model ILIKE ${`%${params.search}%`}
          )`
        : Prisma.empty;

      let statusCondition: Prisma.Sql;
      if (params.status === "paid") {
        statusCondition = Prisma.sql`AND (manually_paid = true OR (paid_amount >= effective_total AND effective_total > 0))`;
      } else if (params.status === "partial") {
        statusCondition = Prisma.sql`AND manually_paid = false AND paid_amount > 0 AND paid_amount < effective_total`;
      } else {
        statusCondition = Prisma.sql`AND manually_paid = false AND paid_amount = 0`;
      }

      const countRows = await db.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT
            sr.id,
            sr."manuallyPaid" AS manually_paid,
            CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END AS effective_total,
            CASE WHEN sr."manuallyPaid" = true
              THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
              ELSE COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."serviceRecordId" = sr.id), 0)
            END AS paid_amount
          FROM service_records sr
          JOIN vehicles v ON v.id = sr."vehicleId"
          WHERE v."organizationId" = ${organizationId}
          ${searchCondition}
        ) sub
        WHERE 1=1 ${statusCondition}
      `);

      const total = Number(countRows[0]?.cnt ?? 0);

      const rows = await db.$queryRaw<
        {
          id: string;
          title: string | null;
          invoiceNumber: string | null;
          serviceDate: Date;
          startDateTime: Date | null;
          invoiceDate: Date | null;
          effective_total: number;
          paid_amount: number;
          manually_paid: boolean;
          vehicle_id: string;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: number | null;
          vehicle_license_plate: string | null;
          customer_id: string | null;
          customer_name: string | null;
        }[]
      >(Prisma.sql`
        SELECT
          sub.id,
          sub.title,
          sub."invoiceNumber",
          sub."serviceDate",
          sub."startDateTime",
          sub."invoiceDate",
          sub.effective_total,
          sub.paid_amount,
          sub.manually_paid,
          sub.vehicle_id,
          sub.vehicle_make,
          sub.vehicle_model,
          sub.vehicle_year,
          sub.vehicle_license_plate,
          sub.customer_id,
          sub.customer_name
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
              ELSE COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."serviceRecordId" = sr.id), 0)
            END AS paid_amount,
            v.id AS vehicle_id,
            v.make AS vehicle_make,
            v.model AS vehicle_model,
            v.year AS vehicle_year,
            v."licensePlate" AS vehicle_license_plate,
            c.id AS customer_id,
            c.name AS customer_name
          FROM service_records sr
          JOIN vehicles v ON v.id = sr."vehicleId"
          LEFT JOIN customers c ON c.id = v."customerId"
          WHERE v."organizationId" = ${organizationId}
          ${searchCondition}
        ) sub
        WHERE 1=1 ${statusCondition}
        ORDER BY ${(() => {
          const dir = params.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
          switch (params.sortBy) {
            case "invoiceNumber": return Prisma.sql`sub."invoiceNumber" ${dir} NULLS LAST`;
            case "title": return Prisma.sql`sub.title ${dir}`;
            case "vehicle": return Prisma.sql`sub.vehicle_make ${dir}, sub.vehicle_model ${dir}, sub.vehicle_year ${dir}`;
            case "customer": return Prisma.sql`sub.customer_name ${dir} NULLS LAST`;
            case "total": return Prisma.sql`sub.effective_total ${dir}`;
            case "date": return Prisma.sql`COALESCE(sub."invoiceDate", sub."startDateTime", sub."serviceDate") ${dir}`;
            default: return Prisma.sql`COALESCE(sub."invoiceDate", sub."startDateTime", sub."serviceDate") DESC`;
          }
        })()}
        LIMIT ${pageSize} OFFSET ${skip}
      `);

      return {
        records: rows.map((r) => {
          const effectiveTotal = Number(r.effective_total);
          const paidAmount = Number(r.paid_amount);
          const manuallyPaid = r.manually_paid;
          const paymentStatus = manuallyPaid || (paidAmount >= effectiveTotal && effectiveTotal > 0)
            ? "paid"
            : paidAmount > 0
              ? "partial"
              : "unpaid";
          return {
          id: r.id,
          title: r.title || "",
          invoiceNumber: r.invoiceNumber,
          startDateTime: r.startDateTime,
          serviceDate: r.invoiceDate ?? r.startDateTime ?? r.serviceDate,
          totalAmount: effectiveTotal,
          totalPaid: paidAmount,
          status: paymentStatus,
          vehicle: {
            id: r.vehicle_id,
            make: r.vehicle_make || "",
            model: r.vehicle_model || "",
            year: r.vehicle_year || 0,
            licensePlate: r.vehicle_license_plate,
            customer: r.customer_id ? { id: r.customer_id, name: r.customer_name || "" } : null,
          },
        };
        }),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        summary,
      };
    }

    // No status filter — use Prisma for clean pagination
    const [records, total] = await Promise.all([
      db.serviceRecord.findMany({
        where,
        include: {
          payments: { select: { amount: true } },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: (() => {
          const dir = params.sortOrder || "desc";
          switch (params.sortBy) {
            case "invoiceNumber": return { invoiceNumber: { sort: dir, nulls: "last" as const } };
            case "title": return { title: dir };
            case "vehicle": return [
              { vehicle: { make: dir } },
              { vehicle: { model: dir } },
              { vehicle: { year: dir } },
            ];
            case "customer": return { vehicle: { customer: { name: dir } } };
            // Approximates the SQL path's effective_total (totalAmount, or
            // cost for drafts where totalAmount is 0)
            case "total": return [{ totalAmount: dir }, { cost: dir }];
            case "date":
            default: return [
              { invoiceDate: { sort: dir, nulls: "last" as const } },
              { startDateTime: { sort: dir, nulls: "last" as const } },
              { serviceDate: dir },
            ];
          }
        })(),
        skip,
        take: pageSize,
      }),
      db.serviceRecord.count({ where }),
    ]);

    return {
      records: records.map((r) => {
        const effectiveTotal = r.totalAmount > 0 ? r.totalAmount : r.cost;
        const paidFromPayments = r.payments.reduce((s, p) => s + p.amount, 0);
        const totalPaid = r.manuallyPaid ? effectiveTotal : paidFromPayments;
        const paymentStatus = r.manuallyPaid || (totalPaid >= effectiveTotal && effectiveTotal > 0)
          ? "paid"
          : totalPaid > 0
            ? "partial"
            : "unpaid";
        return {
          id: r.id,
          title: r.title,
          invoiceNumber: r.invoiceNumber,
          startDateTime: r.startDateTime,
          serviceDate: r.invoiceDate ?? r.startDateTime ?? r.serviceDate,
          totalAmount: effectiveTotal,
          totalPaid,
          status: paymentStatus,
          vehicle: r.vehicle,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] });
}
