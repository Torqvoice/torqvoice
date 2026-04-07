import type {
  RevenueReport,
  ServiceReport,
  CustomerReport,
  InventoryReport,
  TechnicianReport,
  PartsUsageReport,
  JobAnalyticsReport,
  CustomerRetentionReport,
  TaxReport,
  PastDueInvoicesReport,
} from "../Schema/reportTypes";
import { formatCurrency } from "@/lib/format";

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Record<string, unknown>[],
  keys: string[],
) {
  const escapeCsv = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => keys.map((k) => escapeCsv(r[k])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRevenueCsv(
  data: RevenueReport,
  currencyCode: string,
  headers: [string, string, string, string, string, string, string, string] = ["Month", "Revenue", "Collected", "Count", "Parts Cost", "Parts Net Profit", "Labor", "Net Profit"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.monthly.map((m) => ({
    month: m.month,
    revenue: fmt(m.revenue),
    collected: fmt(m.collected),
    count: m.count,
    partsCost: fmt(m.partsCost),
    partsNetProfit: fmt(m.partsNetProfit),
    laborRevenue: fmt(m.laborRevenue),
    netProfit: fmt(m.netProfit),
  }));
  downloadCsv("revenue-report.csv", headers, rows, ["month", "revenue", "collected", "count", "partsCost", "partsNetProfit", "laborRevenue", "netProfit"]);
}

export function exportServicesCsv(
  data: ServiceReport,
  headers: [string, string, string] = ["Category", "Label", "Count"],
) {
  const rows = [
    ...data.byStatus.map((s) => ({ category: "Status", label: s.status, count: s.count })),
    ...data.byType.map((t) => ({ category: "Type", label: t.type, count: t.count })),
  ];
  downloadCsv("services-report.csv", headers, rows, ["category", "label", "count"]);
}

export function exportCustomersCsv(
  data: CustomerReport,
  currencyCode: string,
  headers: [string, string, string, string] = ["Name", "Company", "Services", "Total Spent"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topCustomers.map((c) => ({
    name: c.name,
    company: c.company ?? "",
    serviceCount: c.serviceCount,
    totalSpent: fmt(c.totalSpent),
  }));
  downloadCsv("customers-report.csv", headers, rows, ["name", "company", "serviceCount", "totalSpent"]);
}

export function exportInventoryCsv(
  data: InventoryReport,
  currencyCode: string,
  headers: [string, string, string, string, string] = ["Name", "Part #", "Quantity", "Min Quantity", "Unit Cost"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.lowStock.map((p) => ({
    name: p.name,
    partNumber: p.partNumber ?? "",
    quantity: p.quantity,
    minQuantity: p.minQuantity ?? "",
    unitCost: p.unitCost != null ? fmt(p.unitCost) : "",
  }));
  downloadCsv("inventory-report.csv", headers, rows, ["name", "partNumber", "quantity", "minQuantity", "unitCost"]);
}

export function exportTechniciansCsv(
  data: TechnicianReport,
  currencyCode: string,
  headers: [string, string, string, string, string, string] = ["Technician", "Jobs", "Total Revenue", "Avg Revenue", "Total Hours", "Avg Hours"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.technicians.map((t) => ({
    techName: t.techName,
    jobCount: t.jobCount,
    totalRevenue: fmt(t.totalRevenue),
    avgRevenue: fmt(t.avgRevenue),
    totalHours: t.totalLaborHours.toFixed(1),
    avgHours: t.avgHours.toFixed(1),
  }));
  downloadCsv("technicians-report.csv", headers, rows, ["techName", "jobCount", "totalRevenue", "avgRevenue", "totalHours", "avgHours"]);
}

export function exportPartsCsv(
  data: PartsUsageReport,
  currencyCode: string,
  headers: [string, string, string, string, string, string, string] = ["Part Name", "Part #", "Usage Count", "Total Qty", "Revenue", "Cost", "Net Profit"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.parts.map((p) => ({
    name: p.name,
    partNumber: p.partNumber ?? "",
    usageCount: p.usageCount,
    totalQuantity: p.totalQuantity,
    totalRevenue: fmt(p.totalRevenue),
    totalCost: fmt(p.totalCost),
    netProfit: fmt(p.netProfit),
  }));
  downloadCsv("parts-usage-report.csv", headers, rows, ["name", "partNumber", "usageCount", "totalQuantity", "totalRevenue", "totalCost", "netProfit"]);
}

export function exportJobAnalyticsCsv(
  data: JobAnalyticsReport,
  currencyCode: string,
  headers: [string, string, string, string] = ["Service Type", "Count", "Avg Value", "Avg Hours"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topServiceTypes.map((t) => ({
    type: t.type,
    count: t.count,
    avgValue: fmt(t.avgValue),
    avgHours: t.avgHours.toFixed(1),
  }));
  downloadCsv("job-analytics-report.csv", headers, rows, ["type", "count", "avgValue", "avgHours"]);
}

export function exportRetentionCsv(
  data: CustomerRetentionReport,
  currencyCode: string,
  headers: [string, string, string, string, string] = ["Customer", "Company", "Visits", "Total Spent", "Avg Days Between Visits"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topReturning.map((c) => ({
    name: c.name,
    company: c.company ?? "",
    visitCount: c.visitCount,
    totalSpent: fmt(c.totalSpent),
    avgDaysBetweenVisits: c.avgTimeBetweenVisits ?? "",
  }));
  downloadCsv("retention-report.csv", headers, rows, ["name", "company", "visitCount", "totalSpent", "avgDaysBetweenVisits"]);
}

export function exportPastDueInvoicesCsv(
  data: PastDueInvoicesReport,
  currencyCode: string,
  headers: [string, string, string, string, string, string, string, string] = ["Customer", "Company", "Invoice #", "Total Amount", "Amount Paid", "Amount Due", "Due Date", "Days Past Due"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.invoices.map((inv) => ({
    customer: inv.customerName,
    company: inv.customerCompany ?? "",
    invoiceNumber: inv.invoiceNumber ?? "",
    totalAmount: fmt(inv.totalAmount),
    amountPaid: fmt(inv.amountPaid),
    amountDue: fmt(inv.amountDue),
    dueDate: inv.dueDate,
    daysPastDue: inv.daysPastDue,
  }));
  downloadCsv("past-due-invoices-report.csv", headers, rows, ["customer", "company", "invoiceNumber", "totalAmount", "amountPaid", "amountDue", "dueDate", "daysPastDue"]);
}

export function exportTaxCsv(
  data: TaxReport,
  currencyCode: string,
  headers: [string, string, string, string] = ["Month", "Tax Collected", "Taxable Amount", "Invoice Count"],
) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.monthly.map((m) => ({
    month: m.month,
    taxCollected: fmt(m.taxCollected),
    taxableAmount: fmt(m.taxableAmount),
    invoiceCount: m.invoiceCount,
  }));
  downloadCsv("tax-report.csv", headers, rows, ["month", "taxCollected", "taxableAmount", "invoiceCount"]);
}
