import type {
  RevenueReport,
  ServiceReport,
  CustomerReport,
  InventoryReport,
} from "../Schema/reportTypes";
import { formatCurrency } from "@/lib/format";

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Record<string, unknown>[],
  keys: string[],
) {
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
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
