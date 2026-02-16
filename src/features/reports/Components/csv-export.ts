import type {
  RevenueReport,
  ServiceReport,
  CustomerReport,
  InventoryReport,
  TechnicianReport,
  PartsUsageReport,
  JobAnalyticsReport,
  CustomerRetentionReport,
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

export function exportRevenueCsv(data: RevenueReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.monthly.map((m) => ({
    month: m.month,
    revenue: fmt(m.revenue),
    collected: fmt(m.collected),
    count: m.count,
  }));
  downloadCsv(
    "revenue-report.csv",
    ["Month", "Revenue", "Collected", "Count"],
    rows,
    ["month", "revenue", "collected", "count"],
  );
}

export function exportServicesCsv(data: ServiceReport) {
  const rows = [
    ...data.byStatus.map((s) => ({ category: "Status", label: s.status, count: s.count })),
    ...data.byType.map((t) => ({ category: "Type", label: t.type, count: t.count })),
  ];
  downloadCsv(
    "services-report.csv",
    ["Category", "Label", "Count"],
    rows,
    ["category", "label", "count"],
  );
}

export function exportCustomersCsv(data: CustomerReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topCustomers.map((c) => ({
    name: c.name,
    company: c.company ?? "",
    serviceCount: c.serviceCount,
    totalSpent: fmt(c.totalSpent),
  }));
  downloadCsv(
    "customers-report.csv",
    ["Name", "Company", "Services", "Total Spent"],
    rows,
    ["name", "company", "serviceCount", "totalSpent"],
  );
}

export function exportInventoryCsv(data: InventoryReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.lowStock.map((p) => ({
    name: p.name,
    partNumber: p.partNumber ?? "",
    quantity: p.quantity,
    minQuantity: p.minQuantity ?? "",
    unitCost: p.unitCost != null ? fmt(p.unitCost) : "",
  }));
  downloadCsv(
    "inventory-report.csv",
    ["Name", "Part #", "Quantity", "Min Quantity", "Unit Cost"],
    rows,
    ["name", "partNumber", "quantity", "minQuantity", "unitCost"],
  );
}

export function exportTechniciansCsv(data: TechnicianReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.technicians.map((t) => ({
    techName: t.techName,
    jobCount: t.jobCount,
    totalRevenue: fmt(t.totalRevenue),
    avgRevenue: fmt(t.avgRevenue),
    totalHours: t.totalLaborHours.toFixed(1),
    avgHours: t.avgHours.toFixed(1),
  }));
  downloadCsv(
    "technicians-report.csv",
    ["Technician", "Jobs", "Total Revenue", "Avg Revenue", "Total Hours", "Avg Hours"],
    rows,
    ["techName", "jobCount", "totalRevenue", "avgRevenue", "totalHours", "avgHours"],
  );
}

export function exportPartsCsv(data: PartsUsageReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.parts.map((p) => ({
    name: p.name,
    partNumber: p.partNumber ?? "",
    usageCount: p.usageCount,
    totalQuantity: p.totalQuantity,
    totalRevenue: fmt(p.totalRevenue),
  }));
  downloadCsv(
    "parts-usage-report.csv",
    ["Part Name", "Part #", "Usage Count", "Total Qty", "Total Revenue"],
    rows,
    ["name", "partNumber", "usageCount", "totalQuantity", "totalRevenue"],
  );
}

export function exportJobAnalyticsCsv(data: JobAnalyticsReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topServiceTypes.map((t) => ({
    type: t.type,
    count: t.count,
    avgValue: fmt(t.avgValue),
    avgHours: t.avgHours.toFixed(1),
  }));
  downloadCsv(
    "job-analytics-report.csv",
    ["Service Type", "Count", "Avg Value", "Avg Hours"],
    rows,
    ["type", "count", "avgValue", "avgHours"],
  );
}

export function exportRetentionCsv(data: CustomerRetentionReport, currencyCode: string) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const rows = data.topReturning.map((c) => ({
    name: c.name,
    company: c.company ?? "",
    visitCount: c.visitCount,
    totalSpent: fmt(c.totalSpent),
    avgDaysBetweenVisits: c.avgTimeBetweenVisits ?? "",
  }));
  downloadCsv(
    "retention-report.csv",
    ["Customer", "Company", "Visits", "Total Spent", "Avg Days Between Visits"],
    rows,
    ["name", "company", "visitCount", "totalSpent", "avgDaysBetweenVisits"],
  );
}
