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
        manuallyPaid: true,
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
      const paid = r.manuallyPaid ? total : r.payments.reduce((s, p) => s + p.amount, 0);
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

export async function getTechnicianReport(params: {
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
        techName: { not: null },
      },
      select: {
        techName: true,
        totalAmount: true,
        cost: true,
        laborItems: { select: { hours: true } },
      },
    });

    const byTech: Record<string, { jobCount: number; totalRevenue: number; totalLaborHours: number }> = {};

    for (const r of records) {
      const tech = r.techName || "Unassigned";
      if (!byTech[tech]) byTech[tech] = { jobCount: 0, totalRevenue: 0, totalLaborHours: 0 };
      byTech[tech].jobCount += 1;
      byTech[tech].totalRevenue += r.totalAmount > 0 ? r.totalAmount : r.cost;
      byTech[tech].totalLaborHours += r.laborItems.reduce((s, l) => s + l.hours, 0);
    }

    const technicians = Object.entries(byTech)
      .map(([techName, data]) => ({
        techName,
        jobCount: data.jobCount,
        totalRevenue: data.totalRevenue,
        avgRevenue: data.jobCount > 0 ? data.totalRevenue / data.jobCount : 0,
        totalLaborHours: data.totalLaborHours,
        avgHours: data.jobCount > 0 ? data.totalLaborHours / data.jobCount : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      technicians,
      totalJobs: records.length,
      totalRevenue: technicians.reduce((s, t) => s + t.totalRevenue, 0),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getPartsUsageReport(params: {
  startDate?: string;
  endDate?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = params.startDate ? new Date(params.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = params.endDate ? new Date(params.endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const parts = await db.servicePart.findMany({
      where: {
        serviceRecord: {
          vehicle: { organizationId },
          serviceDate: { gte: start, lte: end },
        },
      },
      select: {
        name: true,
        partNumber: true,
        quantity: true,
        total: true,
      },
    });

    const byPart: Record<string, { partNumber: string | null; usageCount: number; totalQuantity: number; totalRevenue: number }> = {};

    for (const p of parts) {
      const key = p.name.toLowerCase();
      if (!byPart[key]) byPart[key] = { partNumber: p.partNumber, usageCount: 0, totalQuantity: 0, totalRevenue: 0 };
      byPart[key].usageCount += 1;
      byPart[key].totalQuantity += p.quantity;
      byPart[key].totalRevenue += p.total;
      if (p.partNumber && !byPart[key].partNumber) byPart[key].partNumber = p.partNumber;
    }

    const partsByKey: Record<string, string> = {};
    for (const p of parts) {
      const key = p.name.toLowerCase();
      if (!partsByKey[key]) partsByKey[key] = p.name;
    }

    const result = Object.entries(byPart)
      .map(([key, data]) => ({
        name: partsByKey[key] || key,
        partNumber: data.partNumber,
        usageCount: data.usageCount,
        totalQuantity: data.totalQuantity,
        totalRevenue: data.totalRevenue,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 20);

    return {
      parts: result,
      totalPartsRevenue: parts.reduce((s, p) => s + p.total, 0),
      totalPartsUsed: parts.reduce((s, p) => s + p.quantity, 0),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getJobAnalyticsReport(params: {
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
        totalAmount: true,
        cost: true,
        serviceDate: true,
        laborItems: { select: { hours: true } },
      },
    });

    // Average job value
    const totalValue = records.reduce((s, r) => s + (r.totalAmount > 0 ? r.totalAmount : r.cost), 0);
    const avgJobValue = records.length > 0 ? totalValue / records.length : 0;

    // By type with avg value and avg hours
    const byType: Record<string, { count: number; totalValue: number; totalHours: number }> = {};
    for (const r of records) {
      if (!byType[r.type]) byType[r.type] = { count: 0, totalValue: 0, totalHours: 0 };
      byType[r.type].count += 1;
      byType[r.type].totalValue += r.totalAmount > 0 ? r.totalAmount : r.cost;
      byType[r.type].totalHours += r.laborItems.reduce((s, l) => s + l.hours, 0);
    }

    const topServiceTypes = Object.entries(byType)
      .map(([type, data]) => ({
        type,
        count: data.count,
        avgValue: data.count > 0 ? data.totalValue / data.count : 0,
        avgHours: data.count > 0 ? data.totalHours / data.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Day of week distribution
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    for (const r of records) {
      dayCount[r.serviceDate.getDay()] += 1;
    }
    const dayOfWeek = dayNames.map((day, i) => ({ day, count: dayCount[i] }));

    // Monthly trend
    const monthly: Record<string, { count: number; revenue: number }> = {};
    for (const r of records) {
      const month = `${r.serviceDate.getFullYear()}-${String(r.serviceDate.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[month]) monthly[month] = { count: 0, revenue: 0 };
      monthly[month].count += 1;
      monthly[month].revenue += r.totalAmount > 0 ? r.totalAmount : r.cost;
    }
    const monthlyTrend = Object.entries(monthly)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      avgJobValue,
      totalJobs: records.length,
      topServiceTypes,
      dayOfWeek,
      monthlyTrend,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getCustomerRetentionReport(params: {
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
              select: { serviceDate: true, totalAmount: true, cost: true },
              orderBy: { serviceDate: "asc" },
            },
          },
        },
      },
    });

    let returningCustomers = 0;
    let newCustomers = 0;
    const allTimeBetween: number[] = [];
    const topReturning: {
      id: string;
      name: string;
      company: string | null;
      visitCount: number;
      totalSpent: number;
      avgTimeBetweenVisits: number | null;
    }[] = [];

    for (const c of customers) {
      const visits: { date: Date; amount: number }[] = [];
      for (const v of c.vehicles) {
        for (const sr of v.serviceRecords) {
          visits.push({ date: sr.serviceDate, amount: sr.totalAmount > 0 ? sr.totalAmount : sr.cost });
        }
      }

      if (visits.length === 0) continue;

      visits.sort((a, b) => a.date.getTime() - b.date.getTime());

      if (visits.length > 1) {
        returningCustomers += 1;
        const gaps: number[] = [];
        for (let i = 1; i < visits.length; i++) {
          const diffDays = (visits[i].date.getTime() - visits[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
          gaps.push(diffDays);
        }
        const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        allTimeBetween.push(avgGap);

        topReturning.push({
          id: c.id,
          name: c.name,
          company: c.company,
          visitCount: visits.length,
          totalSpent: visits.reduce((s, v) => s + v.amount, 0),
          avgTimeBetweenVisits: Math.round(avgGap),
        });
      } else {
        newCustomers += 1;
      }
    }

    topReturning.sort((a, b) => b.visitCount - a.visitCount);

    return {
      returningCustomers,
      newCustomers,
      totalActive: returningCustomers + newCustomers,
      avgTimeBetweenVisits: allTimeBetween.length > 0
        ? Math.round(allTimeBetween.reduce((s, v) => s + v, 0) / allTimeBetween.length)
        : null,
      topReturning: topReturning.slice(0, 20),
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
        sellPrice: true,
        minQuantity: true,
      },
      orderBy: { name: "asc" },
    });

    let totalValue = 0;
    let totalSellValue = 0;
    let totalItems = 0;
    const lowStock: typeof parts = [];

    for (const p of parts) {
      totalValue += (p.unitCost || 0) * p.quantity;
      totalSellValue += (p.sellPrice > 0 ? p.sellPrice : p.unitCost || 0) * p.quantity;
      totalItems += p.quantity;
      if (p.minQuantity && p.quantity <= p.minQuantity) {
        lowStock.push(p);
      }
    }

    return {
      totalParts: parts.length,
      totalItems,
      totalValue,
      totalSellValue,
      lowStock,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}

export async function getTaxReport(params: {
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
        subtotal: true,
        taxRate: true,
        taxAmount: true,
        totalAmount: true,
      },
      orderBy: { serviceDate: "asc" },
    });

    const monthly: Record<string, { taxCollected: number; invoiceCount: number; taxableAmount: number }> = {};
    const byRate: Record<number, { taxCollected: number; invoiceCount: number }> = {};
    let totalTaxCollected = 0;
    let totalTaxableAmount = 0;
    let totalInvoices = 0;

    for (const r of records) {
      if (r.taxAmount <= 0) continue;

      const month = `${r.serviceDate.getFullYear()}-${String(r.serviceDate.getMonth() + 1).padStart(2, "0")}`;

      if (!monthly[month]) monthly[month] = { taxCollected: 0, invoiceCount: 0, taxableAmount: 0 };
      monthly[month].taxCollected += r.taxAmount;
      monthly[month].invoiceCount += 1;
      monthly[month].taxableAmount += r.subtotal;

      if (!byRate[r.taxRate]) byRate[r.taxRate] = { taxCollected: 0, invoiceCount: 0 };
      byRate[r.taxRate].taxCollected += r.taxAmount;
      byRate[r.taxRate].invoiceCount += 1;

      totalTaxCollected += r.taxAmount;
      totalTaxableAmount += r.subtotal;
      totalInvoices += 1;
    }

    return {
      monthly: Object.entries(monthly).map(([month, data]) => ({ month, ...data })),
      byRate: Object.entries(byRate).map(([rate, data]) => ({ taxRate: Number(rate), ...data })),
      summary: { totalTaxCollected, totalTaxableAmount, totalInvoices },
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.REPORTS }] });
}
