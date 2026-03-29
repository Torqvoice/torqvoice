import { CronJob } from "cron";
import { db } from "@/lib/db";
import { renderToBuffer } from "@react-pdf/renderer";
import "@/features/vehicles/Components/invoice-pdf/fonts";
import React from "react";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { ReportPDF } from "@/features/reports/Components/ReportPDF";
import { formatCurrency } from "@/lib/format";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

// --------------- date helpers ---------------

function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "bimonthly":
      next.setMonth(next.getMonth() + 2);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 4);
      break;
    case "semiannually":
      next.setMonth(next.getMonth() + 6);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  next.setHours(8, 0, 0, 0);
  return next;
}

function getDateRange(dateRange: string): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  switch (dateRange) {
    case "last1d":
      start.setDate(start.getDate() - 1);
      break;
    case "last7d":
      start.setDate(start.getDate() - 7);
      break;
    case "last14d":
      start.setDate(start.getDate() - 14);
      break;
    case "last30d":
      start.setMonth(start.getMonth() - 1);
      break;
    case "last60d":
      start.setMonth(start.getMonth() - 2);
      break;
    case "last90d":
      start.setMonth(start.getMonth() - 3);
      break;
    case "last6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "last12m":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "ytd":
      start.setMonth(0, 1);
      break;
    case "allTime":
      start.setFullYear(2000, 0, 1);
      break;
    default:
      start.setMonth(start.getMonth() - 1);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

// --------------- internal report fetchers ---------------
// These replicate the logic from reportActions.ts but accept orgId directly

async function fetchRevenue(orgId: string, start: Date, end: Date) {
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end } },
    select: {
      serviceDate: true, startDateTime: true, totalAmount: true, cost: true, type: true,
      manuallyPaid: true, payments: { select: { amount: true } },
      partItems: { select: { unitCost: true, quantity: true } },
    },
    orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
  });

  const monthly: Record<string, { revenue: number; collected: number; count: number; partsCost: number }> = {};
  const byType: Record<string, { revenue: number; count: number }> = {};
  let totalRevenue = 0, totalCollected = 0, totalCount = 0, totalPartsCost = 0;

  for (const r of records) {
    const total = r.totalAmount > 0 ? r.totalAmount : r.cost;
    const paid = r.manuallyPaid ? total : r.payments.reduce((s, p) => s + p.amount, 0);
    const partsCost = r.partItems.reduce((s, p) => s + (p.unitCost * p.quantity), 0);
    const _d = r.startDateTime ?? r.serviceDate;
    const month = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`;

    if (!monthly[month]) monthly[month] = { revenue: 0, collected: 0, count: 0, partsCost: 0 };
    monthly[month].revenue += total; monthly[month].collected += paid;
    monthly[month].count += 1; monthly[month].partsCost += partsCost;
    totalRevenue += total; totalCollected += paid; totalCount += 1; totalPartsCost += partsCost;

    if (!byType[r.type]) byType[r.type] = { revenue: 0, count: 0 };
    byType[r.type].revenue += total; byType[r.type].count += 1;
  }

  return {
    monthly: Object.entries(monthly).map(([month, d]) => ({ month, ...d, netProfit: d.revenue - d.partsCost })),
    byType: Object.entries(byType).map(([type, d]) => ({ type, ...d })),
    summary: { totalRevenue, totalCollected, outstanding: totalRevenue - totalCollected, totalCount, totalPartsCost, netProfit: totalRevenue - totalPartsCost },
  };
}

async function fetchServices(orgId: string, start: Date, end: Date) {
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end } },
    select: { type: true, status: true },
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
}

async function fetchCustomers(orgId: string, start: Date, end: Date) {
  const customers = await db.customer.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, company: true, vehicles: { select: { serviceRecords: { where: { startDateTime: { gte: start, lte: end } }, select: { totalAmount: true, cost: true } } } } },
  });
  const ranked = customers.map((c) => {
    let totalSpent = 0, serviceCount = 0;
    for (const v of c.vehicles) for (const sr of v.serviceRecords) { totalSpent += sr.totalAmount > 0 ? sr.totalAmount : sr.cost; serviceCount++; }
    return { id: c.id, name: c.name, company: c.company, totalSpent, serviceCount };
  }).filter((c) => c.serviceCount > 0).sort((a, b) => b.totalSpent - a.totalSpent);
  return { totalCustomers: customers.length, activeCustomers: ranked.length, topCustomers: ranked.slice(0, 20) };
}

async function fetchTechnicians(orgId: string, start: Date, end: Date) {
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end }, OR: [{ technicianId: { not: null } }, { techName: { not: null } }] },
    select: { techName: true, technicianId: true, technician: { select: { name: true } }, totalAmount: true, cost: true, laborItems: { select: { hours: true } } },
  });
  const byTech: Record<string, { techName: string; jobCount: number; totalRevenue: number; totalLaborHours: number }> = {};
  for (const r of records) {
    const key = r.technicianId || `name:${r.techName}`;
    const name = r.technician?.name || r.techName || "Unassigned";
    if (!byTech[key]) byTech[key] = { techName: name, jobCount: 0, totalRevenue: 0, totalLaborHours: 0 };
    byTech[key].jobCount += 1;
    byTech[key].totalRevenue += r.totalAmount > 0 ? r.totalAmount : r.cost;
    byTech[key].totalLaborHours += r.laborItems.reduce((s, l) => s + l.hours, 0);
  }
  const technicians = Object.values(byTech).map((d) => ({
    techName: d.techName, jobCount: d.jobCount, totalRevenue: d.totalRevenue,
    avgRevenue: d.jobCount > 0 ? d.totalRevenue / d.jobCount : 0,
    totalLaborHours: d.totalLaborHours, avgHours: d.jobCount > 0 ? d.totalLaborHours / d.jobCount : 0,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);
  return { technicians, totalJobs: records.length, totalRevenue: technicians.reduce((s, t) => s + t.totalRevenue, 0) };
}

async function fetchParts(orgId: string, start: Date, end: Date) {
  const parts = await db.servicePart.findMany({
    where: { serviceRecord: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end } } },
    select: { name: true, partNumber: true, quantity: true, total: true },
  });
  const byPart: Record<string, { name: string; partNumber: string | null; usageCount: number; totalQuantity: number; totalRevenue: number }> = {};
  for (const p of parts) {
    const key = p.name.toLowerCase();
    if (!byPart[key]) byPart[key] = { name: p.name, partNumber: p.partNumber, usageCount: 0, totalQuantity: 0, totalRevenue: 0 };
    byPart[key].usageCount += 1; byPart[key].totalQuantity += p.quantity; byPart[key].totalRevenue += p.total;
    if (p.partNumber && !byPart[key].partNumber) byPart[key].partNumber = p.partNumber;
  }
  const result = Object.values(byPart).sort((a, b) => b.usageCount - a.usageCount).slice(0, 20);
  return { parts: result, totalPartsRevenue: parts.reduce((s, p) => s + p.total, 0), totalPartsUsed: parts.reduce((s, p) => s + p.quantity, 0) };
}

async function fetchJobAnalytics(orgId: string, start: Date, end: Date) {
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end } },
    select: { type: true, totalAmount: true, cost: true, serviceDate: true, startDateTime: true, laborItems: { select: { hours: true } } },
  });
  const totalValue = records.reduce((s, r) => s + (r.totalAmount > 0 ? r.totalAmount : r.cost), 0);
  const byType: Record<string, { count: number; totalValue: number; totalHours: number }> = {};
  const dayCount = [0, 0, 0, 0, 0, 0, 0];
  const monthly: Record<string, { count: number; revenue: number }> = {};
  for (const r of records) {
    if (!byType[r.type]) byType[r.type] = { count: 0, totalValue: 0, totalHours: 0 };
    byType[r.type].count += 1;
    byType[r.type].totalValue += r.totalAmount > 0 ? r.totalAmount : r.cost;
    byType[r.type].totalHours += r.laborItems.reduce((s, l) => s + l.hours, 0);
    const _d = r.startDateTime ?? r.serviceDate;
    dayCount[_d.getDay()] += 1;
    const month = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[month]) monthly[month] = { count: 0, revenue: 0 };
    monthly[month].count += 1; monthly[month].revenue += r.totalAmount > 0 ? r.totalAmount : r.cost;
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    avgJobValue: records.length > 0 ? totalValue / records.length : 0, totalJobs: records.length,
    topServiceTypes: Object.entries(byType).map(([type, d]) => ({ type, count: d.count, avgValue: d.count > 0 ? d.totalValue / d.count : 0, avgHours: d.count > 0 ? d.totalHours / d.count : 0 })).sort((a, b) => b.count - a.count).slice(0, 10),
    dayOfWeek: dayNames.map((day, i) => ({ day, count: dayCount[i] })),
    monthlyTrend: Object.entries(monthly).map(([month, d]) => ({ month, ...d })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

async function fetchRetention(orgId: string, start: Date, end: Date) {
  const customers = await db.customer.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, company: true, vehicles: { select: { serviceRecords: { where: { startDateTime: { gte: start, lte: end } }, select: { serviceDate: true, startDateTime: true, totalAmount: true, cost: true }, orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }] } } } },
  });
  let returning = 0, newC = 0;
  const allGaps: number[] = [];
  const top: { id: string; name: string; company: string | null; visitCount: number; totalSpent: number; avgTimeBetweenVisits: number | null }[] = [];
  for (const c of customers) {
    const visits: { date: Date; amount: number }[] = [];
    for (const v of c.vehicles) for (const sr of v.serviceRecords) visits.push({ date: sr.startDateTime ?? sr.serviceDate, amount: sr.totalAmount > 0 ? sr.totalAmount : sr.cost });
    if (visits.length === 0) continue;
    visits.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (visits.length > 1) {
      returning++;
      const gaps: number[] = [];
      for (let i = 1; i < visits.length; i++) gaps.push((visits[i].date.getTime() - visits[i - 1].date.getTime()) / 86400000);
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      allGaps.push(avg);
      top.push({ id: c.id, name: c.name, company: c.company, visitCount: visits.length, totalSpent: visits.reduce((s, v) => s + v.amount, 0), avgTimeBetweenVisits: Math.round(avg) });
    } else { newC++; }
  }
  top.sort((a, b) => b.visitCount - a.visitCount);
  return { returningCustomers: returning, newCustomers: newC, totalActive: returning + newC, avgTimeBetweenVisits: allGaps.length > 0 ? Math.round(allGaps.reduce((s, v) => s + v, 0) / allGaps.length) : null, topReturning: top.slice(0, 20) };
}

async function fetchInventory(orgId: string) {
  const parts = await db.inventoryPart.findMany({ where: { organizationId: orgId, isArchived: false }, select: { id: true, name: true, partNumber: true, quantity: true, unitCost: true, sellPrice: true, minQuantity: true }, orderBy: { name: "asc" } });
  let totalValue = 0, totalSellValue = 0, totalItems = 0;
  const lowStock: typeof parts = [];
  for (const p of parts) { totalValue += (p.unitCost || 0) * p.quantity; totalSellValue += (p.sellPrice > 0 ? p.sellPrice : p.unitCost || 0) * p.quantity; totalItems += p.quantity; if (p.minQuantity && p.quantity <= p.minQuantity) lowStock.push(p); }
  return { totalParts: parts.length, totalItems, totalValue, totalSellValue, lowStock };
}

async function fetchPastDue(orgId: string) {
  const now = new Date();
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, invoiceDueDate: { lt: now }, status: { not: "cancelled" } },
    select: { id: true, invoiceNumber: true, invoiceDueDate: true, totalAmount: true, cost: true, manuallyPaid: true, payments: { select: { amount: true } }, vehicle: { select: { year: true, make: true, model: true, customer: { select: { name: true, company: true } } } } },
    orderBy: { invoiceDueDate: "asc" },
  });
  const invoices: { id: string; invoiceNumber: string | null; customerName: string; customerCompany: string | null; vehicleInfo: string; totalAmount: number; amountPaid: number; amountDue: number; dueDate: string; daysPastDue: number }[] = [];
  let totalAmountDue = 0, over30 = 0, over60 = 0, over90 = 0;
  for (const r of records) {
    const total = r.totalAmount > 0 ? r.totalAmount : r.cost;
    const paid = r.manuallyPaid ? total : r.payments.reduce((s, p) => s + p.amount, 0);
    const amountDue = total - paid;
    if (amountDue <= 0) continue;
    const dueDate = r.invoiceDueDate!;
    const days = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
    invoices.push({ id: r.id, invoiceNumber: r.invoiceNumber, customerName: r.vehicle.customer?.name ?? "Unknown", customerCompany: r.vehicle.customer?.company ?? null, vehicleInfo: [r.vehicle.year, r.vehicle.make, r.vehicle.model].filter(Boolean).join(" ") || "N/A", totalAmount: total, amountPaid: paid, amountDue, dueDate: dueDate.toISOString().split("T")[0], daysPastDue: days });
    totalAmountDue += amountDue; if (days > 30) over30++; if (days > 60) over60++; if (days > 90) over90++;
  }
  return { invoices, summary: { totalPastDue: invoices.length, totalAmountDue, totalInvoices: invoices.length, over30, over60, over90 } };
}

async function fetchTax(orgId: string, start: Date, end: Date) {
  const records = await db.serviceRecord.findMany({
    where: { vehicle: { organizationId: orgId }, startDateTime: { gte: start, lte: end } },
    select: { serviceDate: true, startDateTime: true, subtotal: true, taxRate: true, taxAmount: true },
    orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
  });
  const monthly: Record<string, { taxCollected: number; invoiceCount: number; taxableAmount: number }> = {};
  const byRate: Record<number, { taxCollected: number; invoiceCount: number }> = {};
  let totalTaxCollected = 0, totalTaxableAmount = 0, totalInvoices = 0;
  for (const r of records) {
    if (r.taxAmount <= 0) continue;
    const _d = r.startDateTime ?? r.serviceDate;
    const month = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[month]) monthly[month] = { taxCollected: 0, invoiceCount: 0, taxableAmount: 0 };
    monthly[month].taxCollected += r.taxAmount; monthly[month].invoiceCount += 1; monthly[month].taxableAmount += r.subtotal;
    if (!byRate[r.taxRate]) byRate[r.taxRate] = { taxCollected: 0, invoiceCount: 0 };
    byRate[r.taxRate].taxCollected += r.taxAmount; byRate[r.taxRate].invoiceCount += 1;
    totalTaxCollected += r.taxAmount; totalTaxableAmount += r.subtotal; totalInvoices += 1;
  }
  return {
    monthly: Object.entries(monthly).map(([month, d]) => ({ month, ...d })),
    byRate: Object.entries(byRate).map(([rate, d]) => ({ taxRate: Number(rate), ...d })),
    summary: { totalTaxCollected, totalTaxableAmount, totalInvoices },
  };
}

// --------------- process a single schedule ---------------

export async function processOneSchedule(schedule: {
  id: string;
  name: string;
  frequency: string;
  dateRange: string;
  sections: string;
  recipients: string;
  organizationId: string;
  endDate: Date | null;
}) {
  const now = new Date();
  const sections: string[] = JSON.parse(schedule.sections);
  const recipientIds: string[] = JSON.parse(schedule.recipients);
  const { start, end } = getDateRange(schedule.dateRange || "last30d");
  const dateRangeStr = formatDateRange(start, end);

  // Fetch org settings
  const settings = await db.appSetting.findMany({
    where: { organizationId: schedule.organizationId, key: { in: [SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.INVOICE_PRIMARY_COLOR] } },
  });
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;
  const currencyCode = settingsMap[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const primaryColor = settingsMap[SETTING_KEYS.INVOICE_PRIMARY_COLOR] || "#d97706";

  // Fetch report data for selected sections
  const [revenueData, taxData, pastDueData, serviceData, customerData, technicianData, partsData, jobAnalyticsData, retentionData, inventoryData] = await Promise.all([
    sections.includes("revenue") ? fetchRevenue(schedule.organizationId, start, end) : null,
    sections.includes("tax") ? fetchTax(schedule.organizationId, start, end) : null,
    sections.includes("pastDue") ? fetchPastDue(schedule.organizationId) : null,
    sections.includes("services") ? fetchServices(schedule.organizationId, start, end) : null,
    sections.includes("customers") ? fetchCustomers(schedule.organizationId, start, end) : null,
    sections.includes("technicians") ? fetchTechnicians(schedule.organizationId, start, end) : null,
    sections.includes("parts") ? fetchParts(schedule.organizationId, start, end) : null,
    sections.includes("jobAnalytics") ? fetchJobAnalytics(schedule.organizationId, start, end) : null,
    sections.includes("retention") ? fetchRetention(schedule.organizationId, start, end) : null,
    sections.includes("inventory") ? fetchInventory(schedule.organizationId) : null,
  ]);

  // Generate PDF
  const element = React.createElement(ReportPDF, {
    dateRange: dateRangeStr,
    currencyCode,
    primaryColor,
    labels: {},
    revenueData,
    taxData,
    pastDueData,
    serviceData,
    customerData,
    technicianData,
    partsData,
    jobAnalyticsData,
    retentionData,
    inventoryData,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any);

  // Resolve recipient emails
  const recipients = await db.user.findMany({
    where: { id: { in: recipientIds } },
    select: { name: true, email: true },
  });

  const fromAddress = await getOrgFromAddress(schedule.organizationId);
  const org = await db.organization.findUnique({
    where: { id: schedule.organizationId },
    select: { name: true },
  });

  // Send email to each recipient
  for (const recipient of recipients) {
    try {
      await sendOrgMail(schedule.organizationId, {
        to: recipient.email,
        subject: `${schedule.name} – ${dateRangeStr}`,
        html: `<p>Hi ${recipient.name || ""},</p><p>Please find attached your scheduled business report from <strong>${org?.name || "your organization"}</strong>.</p><p>Report period: ${dateRangeStr}<br/>Frequency: ${schedule.frequency}</p><p>This is an automated report.</p>`,
        from: fromAddress,
        attachments: [
          {
            filename: `report-${now.toISOString().split("T")[0]}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } catch (emailErr) {
      console.error(`[cron] Failed to email report to ${recipient.email}:`, emailErr);
    }
  }

  // Update schedule
  const nextRunDate = calculateNextRunDate(now, schedule.frequency);
  const shouldDeactivate = schedule.endDate && nextRunDate > schedule.endDate;

  await db.reportSchedule.update({
    where: { id: schedule.id },
    data: {
      lastRunAt: now,
      runCount: { increment: 1 },
      nextRunDate,
      isActive: !shouldDeactivate,
    },
  });

  console.log(`[cron] Report schedule ${schedule.id} processed, sent to ${recipients.length} recipients`);
}

// --------------- main cron ---------------

export function processReportSchedules() {
  const job = new CronJob("0 * * * *", async () => {
    const dueSchedules = await db.reportSchedule.findMany({
      where: { isActive: true, nextRunDate: { lte: new Date() } },
    });

    for (const schedule of dueSchedules) {
      try {
        await processOneSchedule(schedule);
      } catch (err) {
        console.error(`[cron] Failed to process report schedule ${schedule.id}:`, err);
      }
    }
  });

  job.start();
  console.log("[cron] Report schedule processor started (hourly)");
}
