"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getBillingHistory(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

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

    const allRecords = await db.serviceRecord.findMany({
      where: { vehicle: { organizationId } },
      select: {
        totalAmount: true,
        cost: true,
        payments: { select: { amount: true } },
      },
    });

    let totalRevenue = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let partialCount = 0;

    for (const r of allRecords) {
      const total = r.totalAmount > 0 ? r.totalAmount : r.cost;
      const paid = r.payments.reduce((s, p) => s + p.amount, 0);
      totalRevenue += total;
      totalPaid += paid;
      if (paid >= total && total > 0) paidCount++;
      else if (paid > 0) partialCount++;
      else unpaidCount++;
    }

    // Filter by payment status
    if (params.status === "paid" || params.status === "partial" || params.status === "unpaid") {
      // We need to filter records by computed payment status
      // Use raw approach: get all matching records and filter in JS
      const allMatching = await db.serviceRecord.findMany({
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
        orderBy: { serviceDate: "desc" },
      });

      const filtered = allMatching.filter((r) => {
        const total = r.totalAmount > 0 ? r.totalAmount : r.cost;
        const paid = r.payments.reduce((s, p) => s + p.amount, 0);
        if (params.status === "paid") return paid >= total && total > 0;
        if (params.status === "partial") return paid > 0 && paid < total;
        return paid === 0;
      });

      const paged = filtered.slice(skip, skip + pageSize);

      return {
        records: paged.map((r) => ({
          id: r.id,
          title: r.title,
          invoiceNumber: r.invoiceNumber,
          serviceDate: r.serviceDate,
          totalAmount: r.totalAmount > 0 ? r.totalAmount : r.cost,
          totalPaid: r.payments.reduce((s, p) => s + p.amount, 0),
          status: r.status,
          vehicle: r.vehicle,
        })),
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.ceil(filtered.length / pageSize),
        summary: { totalRevenue, totalPaid, outstanding: totalRevenue - totalPaid, paidCount, unpaidCount, partialCount },
      };
    }

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
        orderBy: { serviceDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.serviceRecord.count({ where }),
    ]);

    return {
      records: records.map((r) => ({
        id: r.id,
        title: r.title,
        invoiceNumber: r.invoiceNumber,
        serviceDate: r.serviceDate,
        totalAmount: r.totalAmount > 0 ? r.totalAmount : r.cost,
        totalPaid: r.payments.reduce((s, p) => s + p.amount, 0),
        status: r.status,
        vehicle: r.vehicle,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary: { totalRevenue, totalPaid, outstanding: totalRevenue - totalPaid, paidCount, unpaidCount, partialCount },
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] });
}
