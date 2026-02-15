"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getRevenueReport(params: {
  startDate?: string;
  endDate?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = params.startDate ? new Date(params.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const records = await db.serviceRecord.findMany({
      where: {
        vehicle: { organizationId },
        serviceDate: { gte: start, lte: end },
      },
      select: {
        serviceDate: true,
        totalAmount: true,
        cost: true,
        type: true,
        payments: { select: { amount: true } },
      },
      orderBy: { serviceDate: "asc" },
    });

    // Monthly breakdown
    const monthly: Record<string, { revenue: number; collected: number; count: number }> = {};
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalCount = 0;

    // Type breakdown
    const byType: Record<string, { revenue: number; count: number }> = {};

    for (const r of records) {
      const total = r.totalAmount > 0 ? r.totalAmount : r.cost;
      const paid = r.payments.reduce((s, p) => s + p.amount, 0);
      const month = `${r.serviceDate.getFullYear()}-${String(r.serviceDate.getMonth() + 1).padStart(2, "0")}`;

      if (!monthly[month]) monthly[month] = { revenue: 0, collected: 0, count: 0 };
      monthly[month].revenue += total;
      monthly[month].collected += paid;
      monthly[month].count += 1;

      totalRevenue += total;
      totalCollected += paid;
      totalCount += 1;

      if (!byType[r.type]) byType[r.type] = { revenue: 0, count: 0 };
      byType[r.type].revenue += total;
      byType[r.type].count += 1;
    }

    return {
      monthly: Object.entries(monthly).map(([month, data]) => ({ month, ...data })),
      byType: Object.entries(byType).map(([type, data]) => ({ type, ...data })),
      summary: { totalRevenue, totalCollected, outstanding: totalRevenue - totalCollected, totalCount },
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getServiceReport(params: {
  startDate?: string;
  endDate?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = params.startDate ? new Date(params.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const records = await db.serviceRecord.findMany({
      where: {
        vehicle: { organizationId },
        serviceDate: { gte: start, lte: end },
      },
      select: {
        type: true,
        status: true,
        totalAmount: true,
        cost: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const r of records) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
    }

    return {
      totalServices: records.length,
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getCustomerReport(params: {
  startDate?: string;
  endDate?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = params.startDate ? new Date(params.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const customers = await db.customer.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        company: true,
        vehicles: {
          select: {
            serviceRecords: {
              where: { serviceDate: { gte: start, lte: end } },
              select: { totalAmount: true, cost: true },
            },
          },
        },
      },
    });

    const ranked = customers
      .map((c) => {
        let totalSpent = 0;
        let serviceCount = 0;
        for (const v of c.vehicles) {
          for (const sr of v.serviceRecords) {
            totalSpent += sr.totalAmount > 0 ? sr.totalAmount : sr.cost;
            serviceCount++;
          }
        }
        return { id: c.id, name: c.name, company: c.company, totalSpent, serviceCount };
      })
      .filter((c) => c.serviceCount > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return {
      totalCustomers: customers.length,
      activeCustomers: ranked.length,
      topCustomers: ranked.slice(0, 20),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getInventoryReport() {
  return withAuth(async ({ organizationId }) => {
    const parts = await db.inventoryPart.findMany({
      where: { organizationId, isArchived: false },
      select: {
        id: true,
        name: true,
        partNumber: true,
        quantity: true,
        unitCost: true,
        minQuantity: true,
      },
      orderBy: { name: "asc" },
    });

    let totalValue = 0;
    let totalItems = 0;
    const lowStock: typeof parts = [];

    for (const p of parts) {
      totalValue += (p.unitCost || 0) * p.quantity;
      totalItems += p.quantity;
      if (p.minQuantity && p.quantity <= p.minQuantity) {
        lowStock.push(p);
      }
    }

    return {
      totalParts: parts.length,
      totalItems,
      totalValue,
      lowStock,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}
