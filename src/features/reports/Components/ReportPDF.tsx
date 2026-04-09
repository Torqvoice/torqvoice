import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
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
  VehicleReportData,
} from "../Schema/reportTypes";
import { formatCurrency } from "@/lib/format";

// --------------- fonts ---------------

Font.register({
  family: "Roboto",
  fonts: [
    { src: "/fonts/Roboto-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Roboto-Bold.ttf", fontWeight: 700 },
  ],
});
Font.register({ family: "Roboto-Bold", src: "/fonts/Roboto-Bold.ttf" });
Font.registerHyphenationCallback((word) => [word]);

// --------------- colour helpers ---------------

import { lightenColor, darkenColor } from "@/features/vehicles/Components/invoice-pdf/styles";

const gray = "#6b7280";
const grayLight = "#f3f4f6";
const dark = "#111827";
const border = "#e5e7eb";

// --------------- styles (dynamic) ---------------

function createReportStyles(primary: string) {
  const primaryLight = lightenColor(primary, 0.9);
  const primaryDark = darkenColor(primary, 0.3);

  return StyleSheet.create({
    page: { padding: 40, fontSize: 9, fontFamily: "Roboto", color: dark },
    // header
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 24,
      paddingBottom: 12,
      borderBottomWidth: 2,
      borderBottomColor: primary,
    },
    title: { fontSize: 20, fontFamily: "Roboto-Bold", color: primary },
    subtitle: { fontSize: 9, color: gray, marginTop: 2 },
    dateBadge: {
      fontSize: 8,
      color: gray,
      backgroundColor: grayLight,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 3,
    },
    // section
    section: { marginBottom: 18 },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Roboto-Bold",
      color: dark,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    // summary cards row
    cardsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    card: {
      flex: 1,
      padding: 10,
      backgroundColor: grayLight,
      borderRadius: 4,
    },
    cardLabel: { fontSize: 7, color: gray, textTransform: "uppercase", marginBottom: 3 },
    cardValue: { fontSize: 13, fontFamily: "Roboto-Bold" },
    // table
    table: { marginBottom: 4 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: primaryLight,
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderRadius: 2,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: border,
    },
    tableRowAlt: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: border,
      backgroundColor: "#fafafa",
    },
    th: { fontSize: 7, fontFamily: "Roboto-Bold", color: primaryDark },
    td: { fontSize: 8 },
    tdRight: { fontSize: 8, textAlign: "right" },
    // footer
    footer: {
      position: "absolute",
      bottom: 25,
      left: 40,
      right: 40,
      textAlign: "center",
      fontSize: 7,
      color: gray,
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: border,
    },
    pageNumber: { fontSize: 7, color: gray },
  });
}

// --------------- helpers ---------------

interface ReportPDFProps {
  dateRange: string;
  currencyCode: string;
  primaryColor: string;
  organizationName?: string;
  labels: Record<string, string>;
  revenueData?: RevenueReport | null;
  serviceData?: ServiceReport | null;
  customerData?: CustomerReport | null;
  inventoryData?: InventoryReport | null;
  technicianData?: TechnicianReport | null;
  partsData?: PartsUsageReport | null;
  jobAnalyticsData?: JobAnalyticsReport | null;
  retentionData?: CustomerRetentionReport | null;
  taxData?: TaxReport | null;
  pastDueData?: PastDueInvoicesReport | null;
  vehicleData?: VehicleReportData | null;
}

type ReportStyles = ReturnType<typeof createReportStyles>;

function SummaryCards({ items, s }: { items: { label: string; value: string }[]; s: ReportStyles }) {
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3));
  }
  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} style={s.cardsRow}>
          {row.map((item, ci) => (
            <View key={ci} style={s.card}>
              <Text style={s.cardLabel}>{item.label}</Text>
              <Text style={s.cardValue}>{item.value}</Text>
            </View>
          ))}
          {row.length < 3 &&
            Array.from({ length: 3 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={{ flex: 1 }} />
            ))}
        </View>
      ))}
    </>
  );
}

function TableBlock({
  headers,
  rows,
  widths,
  s,
}: {
  headers: string[];
  rows: string[][];
  widths: number[];
  s: ReportStyles;
}) {
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        {headers.map((h, i) => (
          <Text
            key={i}
            style={[s.th, { width: `${widths[i]}%`, textAlign: i === 0 ? "left" : "right" }]}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={ri % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          {row.map((cell, ci) => (
            <Text
              key={ci}
              style={[
                ci === 0 ? s.td : s.tdRight,
                { width: `${widths[ci]}%` },
              ]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function ProfitBreakdown({
  s,
  title,
  lines,
  total,
}: {
  s: ReportStyles;
  title: string;
  lines: { label: string; value: string; color: string }[];
  total: { label: string; value: string };
}) {
  return (
    <View style={{ marginBottom: 14, backgroundColor: grayLight, borderRadius: 4, padding: 12 }}>
      <Text style={{ fontSize: 9, fontFamily: "Roboto-Bold", marginBottom: 8 }}>{title}</Text>
      {lines.map((line, i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: line.color }} />
            <Text style={{ fontSize: 8, color: gray }}>{line.label}</Text>
          </View>
          <Text style={{ fontSize: 8, fontFamily: "Roboto-Bold" }}>{line.value}</Text>
        </View>
      ))}
      <View style={{ borderTopWidth: 0.5, borderTopColor: border, marginTop: 4, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 9, fontFamily: "Roboto-Bold" }}>{total.label}</Text>
        <Text style={{ fontSize: 11, fontFamily: "Roboto-Bold" }}>{total.value}</Text>
      </View>
    </View>
  );
}

function PageFooter({ s }: { s: ReportStyles }) {
  return (
    <Text
      style={s.footer}
      render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      fixed
    />
  );
}

// --------------- main document ---------------

export function ReportPDF({
  dateRange,
  currencyCode,
  primaryColor,
  labels: l,
  revenueData,
  serviceData,
  customerData,
  inventoryData,
  technicianData,
  partsData,
  jobAnalyticsData,
  retentionData,
  taxData,
  pastDueData,
  vehicleData,
  organizationName,
}: ReportPDFProps) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const s = createReportStyles(primaryColor);

  const ReportHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <View style={s.headerRow}>
      <View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
        {organizationName ? <Text style={{ fontSize: 8, color: gray, marginTop: 2 }}>{organizationName}</Text> : null}
      </View>
      <Text style={s.dateBadge}>{dateRange}</Text>
    </View>
  );

  return (
    <Document>
      {/* ==================== REVENUE ==================== */}
      {revenueData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.revenueSection || "Revenue Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.revenue || "Revenue", value: fmt(revenueData.summary.totalRevenue) },
              { label: l.collected || "Collected", value: fmt(revenueData.summary.totalCollected) },
              { label: l.outstanding || "Outstanding", value: fmt(revenueData.summary.outstanding) },
            ]}
          />

          <ProfitBreakdown
            s={s}
            title={l.netProfit || "Net Profit"}
            lines={[
              { label: l.partsNetProfit || "Parts Net Profit", value: fmt(revenueData.summary.totalPartsNetProfit), color: "#22c55e" },
              { label: l.laborRevenue || "Labor", value: fmt(revenueData.summary.totalLaborRevenue), color: "#3b82f6" },
            ]}
            total={{ label: l.netProfit || "Net Profit", value: fmt(revenueData.summary.netProfit) }}
          />

          <View style={s.section}>
            <Text style={s.sectionTitle}>{l.monthlyBreakdown || "Monthly Breakdown"}</Text>
            <TableBlock
              s={s}
              headers={[
                l.month || "Month",
                l.revenue || "Revenue",
                l.collected || "Collected",
                l.partsCost || "Parts Cost",
                l.partsNetProfit || "Parts Profit",
                l.laborRevenue || "Labor",
                l.netProfit || "Net Profit",
                l.count || "Jobs",
              ]}
              widths={[16, 14, 14, 12, 12, 12, 12, 8]}
              rows={revenueData.monthly.map((m) => [
                m.month,
                fmt(m.revenue),
                fmt(m.collected),
                fmt(m.partsCost),
                fmt(m.partsNetProfit),
                fmt(m.laborRevenue),
                fmt(m.netProfit),
                String(m.count),
              ])}
            />
          </View>

          {revenueData.byType.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.revenueByType || "Revenue by Type"}</Text>
              <TableBlock
                s={s}
                headers={[l.type || "Type", l.revenue || "Revenue", l.count || "Count"]}
                widths={[50, 30, 20]}
                rows={revenueData.byType.map((t) => [
                  t.type,
                  fmt(t.revenue),
                  String(t.count),
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== TAX ==================== */}
      {taxData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.taxSection || "Tax Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.taxCollected || "Tax Collected", value: fmt(taxData.summary.totalTaxCollected) },
              { label: l.taxableAmount || "Taxable Amount", value: fmt(taxData.summary.totalTaxableAmount) },
              { label: l.invoices || "Invoices", value: String(taxData.summary.totalInvoices) },
            ]}
          />

          <View style={s.section}>
            <Text style={s.sectionTitle}>{l.monthlyBreakdown || "Monthly Breakdown"}</Text>
            <TableBlock
              s={s}
              headers={[
                l.month || "Month",
                l.taxCollected || "Tax Collected",
                l.taxableAmount || "Taxable Amount",
                l.invoiceCount || "Invoices",
              ]}
              widths={[30, 25, 25, 20]}
              rows={taxData.monthly.map((m) => [
                m.month,
                fmt(m.taxCollected),
                fmt(m.taxableAmount),
                String(m.invoiceCount),
              ])}
            />
          </View>

          {taxData.byRate.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.taxByRate || "Tax by Rate"}</Text>
              <TableBlock
                s={s}
                headers={[l.taxRate || "Tax Rate", l.taxCollected || "Tax Collected", l.invoiceCount || "Invoices"]}
                widths={[40, 35, 25]}
                rows={taxData.byRate.map((r) => [
                  `${r.taxRate}%`,
                  fmt(r.taxCollected),
                  String(r.invoiceCount),
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== PAST DUE INVOICES ==================== */}
      {pastDueData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.pastDueSection || "Past Due Invoices"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalPastDue || "Total Past Due", value: String(pastDueData.summary.totalPastDue) },
              { label: l.totalAmountDue || "Amount Due", value: fmt(pastDueData.summary.totalAmountDue) },
              { label: l.over30 || "Over 30 Days", value: String(pastDueData.summary.over30) },
              { label: l.over60 || "Over 60 Days", value: String(pastDueData.summary.over60) },
              { label: l.over90 || "Over 90 Days", value: String(pastDueData.summary.over90) },
            ]}
          />

          <View style={s.section}>
            <TableBlock
              s={s}
              headers={[
                l.customer || "Customer",
                l.invoiceNumber || "Invoice #",
                l.totalAmount || "Total",
                l.amountDue || "Due",
                l.dueDate || "Due Date",
                l.daysPastDue || "Days",
              ]}
              widths={[24, 14, 16, 16, 16, 14]}
              rows={pastDueData.invoices.map((inv) => [
                inv.customerName,
                inv.invoiceNumber || "-",
                fmt(inv.totalAmount),
                fmt(inv.amountDue),
                inv.dueDate,
                String(inv.daysPastDue),
              ])}
            />
          </View>
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== SERVICES ==================== */}
      {serviceData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.servicesSection || "Services Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalServices || "Total Services", value: String(serviceData.totalServices) },
            ]}
          />

          {serviceData.byStatus.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.servicesByStatus || "By Status"}</Text>
              <TableBlock
                s={s}
                headers={[l.status || "Status", l.count || "Count"]}
                widths={[60, 40]}
                rows={serviceData.byStatus.map((s) => [s.status, String(s.count)])}
              />
            </View>
          )}

          {serviceData.byType.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.servicesByType || "By Type"}</Text>
              <TableBlock
                s={s}
                headers={[l.type || "Type", l.count || "Count"]}
                widths={[60, 40]}
                rows={serviceData.byType.map((t) => [t.type, String(t.count)])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== CUSTOMERS ==================== */}
      {customerData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.customersSection || "Customers Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalCustomers || "Total Customers", value: String(customerData.totalCustomers) },
              { label: l.activeCustomers || "Active Customers", value: String(customerData.activeCustomers) },
            ]}
          />

          {customerData.topCustomers.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.topCustomers || "Top Customers"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.name || "Name",
                  l.company || "Company",
                  l.services || "Services",
                  l.totalSpent || "Total Spent",
                ]}
                widths={[30, 30, 15, 25]}
                rows={customerData.topCustomers.map((c) => [
                  c.name,
                  c.company || "-",
                  String(c.serviceCount),
                  fmt(c.totalSpent),
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== TECHNICIANS ==================== */}
      {technicianData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.techniciansSection || "Technicians Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalJobs || "Total Jobs", value: String(technicianData.totalJobs) },
              { label: l.totalRevenue || "Total Revenue", value: fmt(technicianData.totalRevenue) },
            ]}
          />

          <View style={s.section}>
            <TableBlock
              s={s}
              headers={[
                l.technician || "Technician",
                l.jobs || "Jobs",
                l.totalRevenue || "Revenue",
                l.avgRevenue || "Avg Revenue",
                l.totalHours || "Hours",
                l.avgHours || "Avg Hours",
              ]}
              widths={[22, 12, 18, 18, 15, 15]}
              rows={technicianData.technicians.map((t) => [
                t.techName,
                String(t.jobCount),
                fmt(t.totalRevenue),
                fmt(t.avgRevenue),
                t.totalLaborHours.toFixed(1),
                t.avgHours.toFixed(1),
              ])}
            />
          </View>
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== PARTS USAGE ==================== */}
      {partsData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.partsSection || "Parts Usage Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalPartsUsed || "Parts Used", value: String(partsData.totalPartsUsed) },
              { label: l.totalPartsRevenue || "Parts Revenue", value: fmt(partsData.totalPartsRevenue) },
              { label: l.totalPartsCost || "Parts Cost", value: fmt(partsData.totalPartsCost) },
              { label: l.totalPartsNetProfit || "Net Profit", value: fmt(partsData.totalPartsNetProfit) },
            ]}
          />

          <View style={s.section}>
            <TableBlock
              s={s}
              headers={[
                l.partName || "Part",
                l.partNumber || "Part #",
                l.usageCount || "Used",
                l.totalQty || "Qty",
                l.totalRevenue || "Revenue",
                l.totalPartsCost || "Cost",
                l.netProfit || "Profit",
              ]}
              widths={[22, 16, 12, 12, 14, 12, 12]}
              rows={partsData.parts.map((p) => [
                p.name,
                p.partNumber || "-",
                String(p.usageCount),
                String(p.totalQuantity),
                fmt(p.totalRevenue),
                fmt(p.totalCost),
                fmt(p.netProfit),
              ])}
            />
          </View>
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== JOB ANALYTICS ==================== */}
      {jobAnalyticsData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.jobAnalyticsSection || "Job Analytics"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalJobs || "Total Jobs", value: String(jobAnalyticsData.totalJobs) },
              { label: l.avgJobValue || "Avg Job Value", value: fmt(jobAnalyticsData.avgJobValue) },
            ]}
          />

          {jobAnalyticsData.topServiceTypes.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.topServiceTypes || "Top Service Types"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.serviceType || "Service Type",
                  l.count || "Count",
                  l.avgValue || "Avg Value",
                  l.avgHours || "Avg Hours",
                ]}
                widths={[35, 20, 25, 20]}
                rows={jobAnalyticsData.topServiceTypes.map((t) => [
                  t.type,
                  String(t.count),
                  fmt(t.avgValue),
                  t.avgHours.toFixed(1),
                ])}
              />
            </View>
          )}

          {jobAnalyticsData.dayOfWeek.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.dayOfWeek || "Jobs by Day of Week"}</Text>
              <TableBlock
                s={s}
                headers={[l.day || "Day", l.count || "Count"]}
                widths={[60, 40]}
                rows={jobAnalyticsData.dayOfWeek.map((d) => [d.day, String(d.count)])}
              />
            </View>
          )}

          {jobAnalyticsData.monthlyTrend.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.monthlyTrend || "Monthly Trend"}</Text>
              <TableBlock
                s={s}
                headers={[l.month || "Month", l.count || "Jobs", l.revenue || "Revenue"]}
                widths={[40, 25, 35]}
                rows={jobAnalyticsData.monthlyTrend.map((m) => [
                  m.month,
                  String(m.count),
                  fmt(m.revenue),
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== RETENTION ==================== */}
      {retentionData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.retentionSection || "Customer Retention"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.returningCustomers || "Returning", value: String(retentionData.returningCustomers) },
              { label: l.newCustomers || "New", value: String(retentionData.newCustomers) },
              { label: l.totalActive || "Total Active", value: String(retentionData.totalActive) },
              {
                label: l.avgTimeBetweenVisits || "Avg Days Between Visits",
                value: retentionData.avgTimeBetweenVisits != null
                  ? `${retentionData.avgTimeBetweenVisits} ${l.days || "days"}`
                  : "-",
              },
            ]}
          />

          {retentionData.topReturning.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.topReturning || "Top Returning Customers"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.customer || "Customer",
                  l.company || "Company",
                  l.visits || "Visits",
                  l.totalSpent || "Total Spent",
                  l.avgDaysBetweenVisits || "Avg Days",
                ]}
                widths={[25, 22, 13, 22, 18]}
                rows={retentionData.topReturning.map((c) => [
                  c.name,
                  c.company || "-",
                  String(c.visitCount),
                  fmt(c.totalSpent),
                  c.avgTimeBetweenVisits != null ? String(c.avgTimeBetweenVisits) : "-",
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== INVENTORY ==================== */}
      {inventoryData && (
        <Page size="A4" style={s.page}>
          <ReportHeader title={l.reportTitle || "Business Report"} subtitle={l.inventorySection || "Inventory Report"} />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalParts || "Total Parts", value: String(inventoryData.totalParts) },
              { label: l.totalItems || "Total Items", value: String(inventoryData.totalItems) },
              { label: l.totalValue || "Total Value", value: fmt(inventoryData.totalValue) },
              { label: l.totalSellValue || "Sell Value", value: fmt(inventoryData.totalSellValue) },
            ]}
          />

          {inventoryData.lowStock.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.lowStock || "Low Stock Items"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.name || "Name",
                  l.partNumber || "Part #",
                  l.quantity || "Qty",
                  l.minQuantity || "Min Qty",
                  l.unitCost || "Unit Cost",
                ]}
                widths={[30, 20, 15, 15, 20]}
                rows={inventoryData.lowStock.map((p) => [
                  p.name,
                  p.partNumber || "-",
                  String(p.quantity),
                  p.minQuantity != null ? String(p.minQuantity) : "-",
                  p.unitCost != null ? fmt(p.unitCost) : "-",
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}

      {/* ==================== VEHICLE ==================== */}
      {vehicleData && (
        <Page size="A4" style={s.page}>
          <ReportHeader
            title={l.vehiclesSection || "Vehicle Report"}
            subtitle={`${vehicleData.vehicleInfo.year} ${vehicleData.vehicleInfo.make} ${vehicleData.vehicleInfo.model}${[vehicleData.vehicleInfo.licensePlate, vehicleData.vehicleInfo.vin, vehicleData.vehicleInfo.customerName].filter(Boolean).length > 0 ? ` — ${[vehicleData.vehicleInfo.licensePlate, vehicleData.vehicleInfo.vin, vehicleData.vehicleInfo.customerName].filter(Boolean).join(" · ")}` : ""}`}
          />

          <SummaryCards
            s={s}
            items={[
              { label: l.totalServices || "Total Services", value: String(vehicleData.summary.totalServices) },
              { label: l.totalCost || "Total Cost", value: fmt(vehicleData.summary.totalCost) },
              { label: l.totalPartsUsed || "Parts Used", value: String(vehicleData.summary.totalPartsUsed) },
              { label: l.totalLaborHours || "Labor Hours", value: vehicleData.summary.totalLaborHours.toFixed(1) },
            ]}
          />

          {vehicleData.serviceTypeBreakdown.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.serviceTypeBreakdown || "Expenses by Service Type"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.type || "Type",
                  l.count || "Count",
                  l.totalCost || "Cost",
                ]}
                widths={[40, 20, 40]}
                rows={[
                  ...vehicleData.serviceTypeBreakdown.map((item) => [
                    item.type.charAt(0).toUpperCase() + item.type.slice(1),
                    String(item.count),
                    fmt(item.totalCost),
                  ]),
                  [
                    l.totalCost || "Total",
                    String(vehicleData.summary.totalServices),
                    fmt(vehicleData.summary.totalCost),
                  ],
                ]}
              />
            </View>
          )}

          {vehicleData.monthlyCosts.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.monthlyBreakdown || "Monthly Breakdown"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.month || "Month",
                  l.partsCostLabel || "Parts Cost",
                  l.laborCostLabel || "Labor Cost",
                  l.totalCost || "Total Cost",
                  l.count || "Jobs",
                ]}
                widths={[24, 22, 22, 22, 10]}
                rows={vehicleData.monthlyCosts.map((m) => [
                  m.month,
                  fmt(m.partsCost),
                  fmt(m.laborCost),
                  fmt(m.totalCost),
                  String(m.count),
                ])}
              />
            </View>
          )}

          {vehicleData.serviceHistory.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{l.serviceHistory || "Service History"}</Text>
              <TableBlock
                s={s}
                headers={[
                  l.date || "Date",
                  l.title || "Title",
                  l.type || "Type",
                  l.status || "Status",
                  l.totalAmount || "Total",
                ]}
                widths={[18, 32, 16, 16, 18]}
                rows={vehicleData.serviceHistory.map((r) => [
                  r.date,
                  r.title,
                  r.type,
                  r.status,
                  fmt(r.totalAmount),
                ])}
              />
            </View>
          )}
          <PageFooter s={s} />
        </Page>
      )}
    </Document>
  );
}
