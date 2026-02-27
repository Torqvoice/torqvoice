"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  BarChart3,
  Package,
  Users,
  DollarSign,
  Download,
  TrendingUp,
  AlertTriangle,
  Wrench,
  Cog,
  CalendarDays,
  UserCheck,
  Receipt,
} from "lucide-react";
import {
  getRevenueReport,
  getServiceReport,
  getCustomerReport,
  getInventoryReport,
  getTechnicianReport,
  getPartsUsageReport,
  getJobAnalyticsReport,
  getCustomerRetentionReport,
  getTaxReport,
} from "@/features/reports/Actions/reportActions";
import { formatCurrency } from "@/lib/format";
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
} from "@/features/reports/Schema/reportTypes";
import { RevenueBarChart, RevenueTypeDonut } from "@/features/reports/Components/RevenueCharts";
import { ServiceStatusChart, ServiceTypeDonut } from "@/features/reports/Components/ServiceCharts";
import { TopCustomersChart } from "@/features/reports/Components/CustomerCharts";
import { TechnicianBarChart } from "@/features/reports/Components/TechnicianCharts";
import { PartsDonut } from "@/features/reports/Components/PartsCharts";
import { DayOfWeekChart, ServiceTypeAnalyticsDonut, MonthlyTrendChart } from "@/features/reports/Components/JobAnalyticsCharts";
import { RetentionBarChart } from "@/features/reports/Components/RetentionCharts";
import { TaxBarChart } from "@/features/reports/Components/TaxCharts";
import {
  exportRevenueCsv,
  exportServicesCsv,
  exportCustomersCsv,
  exportInventoryCsv,
  exportTechniciansCsv,
  exportPartsCsv,
  exportJobAnalyticsCsv,
  exportRetentionCsv,
  exportTaxCsv,
} from "@/features/reports/Components/csv-export";

type ReportTab = "revenue" | "services" | "customers" | "inventory" | "technicians" | "parts" | "job-analytics" | "retention" | "tax";

interface ReportsClientProps {
  currencyCode: string;
}

export default function ReportsClient({ currencyCode }: ReportsClientProps) {
  const t = useTranslations("reports");
  const currentYear = new Date().getFullYear();
  const defaultStart = `${currentYear}-01-01`;
  const defaultEnd = new Date().toISOString().split("T")[0];

  const [activeTab, setActiveTab] = useState<ReportTab>("revenue");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);

  const [revenueData, setRevenueData] = useState<RevenueReport | null>(null);
  const [serviceData, setServiceData] = useState<ServiceReport | null>(null);
  const [customerData, setCustomerData] = useState<CustomerReport | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReport | null>(null);
  const [technicianData, setTechnicianData] = useState<TechnicianReport | null>(null);
  const [partsData, setPartsData] = useState<PartsUsageReport | null>(null);
  const [jobAnalyticsData, setJobAnalyticsData] = useState<JobAnalyticsReport | null>(null);
  const [retentionData, setRetentionData] = useState<CustomerRetentionReport | null>(null);
  const [taxData, setTaxData] = useState<TaxReport | null>(null);

  const fmtCurrency = useCallback(
    (value: number) => formatCurrency(value, currencyCode),
    [currencyCode],
  );

  const fetchReport = useCallback(
    async (type: ReportTab) => {
      setLoading(true);
      try {
        const dateParams = { startDate, endDate };
        switch (type) {
          case "revenue": {
            const result = await getRevenueReport(dateParams);
            if (result.success && result.data) setRevenueData(result.data);
            break;
          }
          case "services": {
            const result = await getServiceReport(dateParams);
            if (result.success && result.data) setServiceData(result.data);
            break;
          }
          case "customers": {
            const result = await getCustomerReport(dateParams);
            if (result.success && result.data) setCustomerData(result.data);
            break;
          }
          case "inventory": {
            const result = await getInventoryReport();
            if (result.success && result.data) setInventoryData(result.data);
            break;
          }
          case "technicians": {
            const result = await getTechnicianReport(dateParams);
            if (result.success && result.data) setTechnicianData(result.data);
            break;
          }
          case "parts": {
            const result = await getPartsUsageReport(dateParams);
            if (result.success && result.data) setPartsData(result.data);
            break;
          }
          case "job-analytics": {
            const result = await getJobAnalyticsReport(dateParams);
            if (result.success && result.data) setJobAnalyticsData(result.data);
            break;
          }
          case "retention": {
            const result = await getCustomerRetentionReport(dateParams);
            if (result.success && result.data) setRetentionData(result.data);
            break;
          }
          case "tax": {
            const result = await getTaxReport(dateParams);
            if (result.success && result.data) setTaxData(result.data);
            break;
          }
        }
      } catch (error) {
        console.error("Failed to fetch report:", error);
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate],
  );

  // Auto-fetch revenue on mount
  useEffect(() => {
    fetchReport("revenue");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (value: string) => {
    const tab = value as ReportTab;
    setActiveTab(tab);
    const dataMap: Record<ReportTab, unknown> = {
      revenue: revenueData,
      services: serviceData,
      customers: customerData,
      inventory: inventoryData,
      technicians: technicianData,
      parts: partsData,
      "job-analytics": jobAnalyticsData,
      retention: retentionData,
      tax: taxData,
    };
    if (!dataMap[tab]) {
      fetchReport(tab);
    }
  };

  const handleRefresh = () => {
    fetchReport(activeTab);
  };

  const handleExport = () => {
    const h = (key: string) => t(`csvHeaders.${key}`);
    switch (activeTab) {
      case "revenue":
        if (revenueData) exportRevenueCsv(revenueData, currencyCode, [h("month"), h("revenue"), h("collected"), h("count")]);
        break;
      case "services":
        if (serviceData) exportServicesCsv(serviceData, [h("category"), h("label"), h("count")]);
        break;
      case "customers":
        if (customerData) exportCustomersCsv(customerData, currencyCode, [h("name"), h("company"), h("services"), h("totalSpent")]);
        break;
      case "inventory":
        if (inventoryData) exportInventoryCsv(inventoryData, currencyCode, [h("name"), h("partNumber"), h("quantity"), h("minQuantity"), h("unitCost")]);
        break;
      case "technicians":
        if (technicianData) exportTechniciansCsv(technicianData, currencyCode, [h("technician"), h("jobs"), h("totalRevenue"), h("avgRevenue"), h("totalHours"), h("avgHours")]);
        break;
      case "parts":
        if (partsData) exportPartsCsv(partsData, currencyCode, [h("partName"), h("partNumber"), h("usageCount"), h("totalQty"), h("totalRevenue")]);
        break;
      case "job-analytics":
        if (jobAnalyticsData) exportJobAnalyticsCsv(jobAnalyticsData, currencyCode, [h("serviceType"), h("count"), h("avgValue"), h("avgHours")]);
        break;
      case "retention":
        if (retentionData) exportRetentionCsv(retentionData, currencyCode, [h("customer"), h("company"), h("visits"), h("totalSpent"), h("avgDaysBetweenVisits")]);
        break;
      case "tax":
        if (taxData) exportTaxCsv(taxData, currencyCode, [h("month"), h("taxCollected"), h("taxableAmount"), h("invoiceCount")]);
        break;
    }
  };

  const dataMap: Record<ReportTab, unknown> = {
    revenue: revenueData,
    services: serviceData,
    customers: customerData,
    inventory: inventoryData,
    technicians: technicianData,
    parts: partsData,
    "job-analytics": jobAnalyticsData,
    retention: retentionData,
    tax: taxData,
  };
  const hasData = !!dataMap[activeTab];

  const showDateRange = activeTab !== "inventory";

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {/* Tab bar with date range and actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="revenue" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            {t("tabs.revenue")}
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            {t("tabs.services")}
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-4 w-4" />
            {t("tabs.customers")}
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5">
            <Package className="h-4 w-4" />
            {t("tabs.inventory")}
          </TabsTrigger>
          <TabsTrigger value="technicians" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            {t("tabs.technicians")}
          </TabsTrigger>
          <TabsTrigger value="parts" className="gap-1.5">
            <Cog className="h-4 w-4" />
            {t("tabs.parts")}
          </TabsTrigger>
          <TabsTrigger value="job-analytics" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {t("tabs.jobAnalytics")}
          </TabsTrigger>
          <TabsTrigger value="retention" className="gap-1.5">
            <UserCheck className="h-4 w-4" />
            {t("tabs.retention")}
          </TabsTrigger>
          <TabsTrigger value="tax" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            {t("tabs.tax")}
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          {showDateRange && (
            <>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <span className="text-muted-foreground text-sm">{t("dateRange.to")}</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
            </>
          )}
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("actions.refresh")}
          </Button>
          {hasData && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("actions.csv")}
            </Button>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Revenue Tab */}
      <TabsContent value="revenue">
        {!loading && revenueData && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <DollarSign className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("revenue.revenue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(revenueData.summary.totalRevenue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("revenue.collected")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(revenueData.summary.totalCollected)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("revenue.outstanding")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(revenueData.summary.outstanding)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
                    <BarChart3 className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("revenue.services")}</p>
                    <p className="text-lg font-semibold">
                      {revenueData.summary.totalCount}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="border-0 shadow-sm lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenue.monthlyRevenue")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueBarChart
                    data={revenueData.monthly}
                    formatCurrency={fmtCurrency}
                    labels={{ revenue: t("charts.revenue"), collected: t("charts.collected") }}
                  />
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenue.revenueByType")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueTypeDonut data={revenueData.byType} formatCurrency={fmtCurrency} />
                </CardContent>
              </Card>
            </div>

            {/* Monthly table */}
            {revenueData.monthly.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenue.monthlyBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("revenue.tableHeaders.month")}</TableHead>
                        <TableHead className="text-right">{t("revenue.tableHeaders.revenue")}</TableHead>
                        <TableHead className="text-right">{t("revenue.tableHeaders.collected")}</TableHead>
                        <TableHead className="text-right">{t("revenue.tableHeaders.count")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueData.monthly.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="text-sm">{row.month}</TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.collected)}
                          </TableCell>
                          <TableCell className="text-right text-sm">{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !revenueData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Services Tab */}
      <TabsContent value="services">
        {!loading && serviceData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-1 max-w-xs">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("services.totalServices")}</p>
                    <p className="text-lg font-semibold">{serviceData.totalServices}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {serviceData.byStatus.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("services.byStatus")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ServiceStatusChart data={serviceData.byStatus} labels={{ count: t("charts.count") }} />
                  </CardContent>
                </Card>
              )}
              {serviceData.byType.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("services.byType")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ServiceTypeDonut data={serviceData.byType} />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
        {!loading && !serviceData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Customers Tab */}
      <TabsContent value="customers">
        {!loading && customerData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 max-w-lg">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("customers.total")}</p>
                    <p className="text-lg font-semibold">{customerData.totalCustomers}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <Users className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("customers.active")}</p>
                    <p className="text-lg font-semibold">{customerData.activeCustomers}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {customerData.topCustomers.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("customers.topCustomersBySpend")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TopCustomersChart
                    data={customerData.topCustomers}
                    formatCurrency={fmtCurrency}
                    labels={{ totalSpent: t("charts.totalSpent") }}
                  />
                </CardContent>
              </Card>
            )}
            {customerData.topCustomers.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("customers.topCustomers")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("customers.tableHeaders.name")}</TableHead>
                        <TableHead>{t("customers.tableHeaders.company")}</TableHead>
                        <TableHead className="text-right">{t("customers.tableHeaders.services")}</TableHead>
                        <TableHead className="text-right">{t("customers.tableHeaders.totalSpent")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerData.topCustomers.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm">{row.company ?? "-"}</TableCell>
                          <TableCell className="text-right text-sm">{row.serviceCount}</TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.totalSpent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !customerData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Inventory Tab */}
      <TabsContent value="inventory">
        {!loading && inventoryData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Package className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("inventory.parts")}</p>
                    <p className="text-lg font-semibold">{inventoryData.totalParts}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <Package className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("inventory.items")}</p>
                    <p className="text-lg font-semibold">{inventoryData.totalItems}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("inventory.costValue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(inventoryData.totalValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
                    <DollarSign className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("inventory.sellValue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(inventoryData.totalSellValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("inventory.potentialMargin")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(inventoryData.totalSellValue - inventoryData.totalValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {inventoryData.lowStock.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("inventory.lowStock")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("inventory.tableHeaders.name")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.partNumber")}</TableHead>
                        <TableHead className="text-right">{t("inventory.tableHeaders.qty")}</TableHead>
                        <TableHead className="text-right">{t("inventory.tableHeaders.minQty")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryData.lowStock.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm">{row.partNumber ?? "-"}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                row.minQuantity != null && row.quantity <= row.minQuantity
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {row.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.minQuantity ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !inventoryData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Technicians Tab */}
      <TabsContent value="technicians">
        {!loading && technicianData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 max-w-lg">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
                    <Wrench className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("technicians.totalJobs")}</p>
                    <p className="text-lg font-semibold">{technicianData.totalJobs}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("technicians.totalRevenue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(technicianData.totalRevenue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {technicianData.technicians.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("technicians.revenueByTechnician")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TechnicianBarChart
                    data={technicianData.technicians}
                    formatCurrency={fmtCurrency}
                    labels={{ revenue: t("charts.revenue") }}
                  />
                </CardContent>
              </Card>
            )}
            {technicianData.technicians.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("technicians.technicianBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("technicians.tableHeaders.technician")}</TableHead>
                        <TableHead className="text-right">{t("technicians.tableHeaders.jobs")}</TableHead>
                        <TableHead className="text-right">{t("technicians.tableHeaders.revenue")}</TableHead>
                        <TableHead className="text-right">{t("technicians.tableHeaders.avgRevenue")}</TableHead>
                        <TableHead className="text-right">{t("technicians.tableHeaders.totalHours")}</TableHead>
                        <TableHead className="text-right">{t("technicians.tableHeaders.avgHours")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {technicianData.technicians.map((row) => (
                        <TableRow key={row.techName}>
                          <TableCell className="text-sm font-medium">{row.techName}</TableCell>
                          <TableCell className="text-right text-sm">{row.jobCount}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.totalRevenue)}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.avgRevenue)}</TableCell>
                          <TableCell className="text-right text-sm">{row.totalLaborHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-sm">{row.avgHours.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !technicianData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Parts Tab */}
      <TabsContent value="parts">
        {!loading && partsData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 max-w-lg">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Cog className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("parts.partsUsed")}</p>
                    <p className="text-lg font-semibold">{partsData.totalPartsUsed}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("parts.partsRevenue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(partsData.totalPartsRevenue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {partsData.parts.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("parts.topPartsByUsage")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PartsDonut data={partsData.parts} />
                </CardContent>
              </Card>
            )}
            {partsData.parts.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("parts.partsUsage")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("parts.tableHeaders.partName")}</TableHead>
                        <TableHead>{t("parts.tableHeaders.partNumber")}</TableHead>
                        <TableHead className="text-right">{t("parts.tableHeaders.usageCount")}</TableHead>
                        <TableHead className="text-right">{t("parts.tableHeaders.totalQty")}</TableHead>
                        <TableHead className="text-right">{t("parts.tableHeaders.revenue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partsData.parts.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm">{row.partNumber ?? "-"}</TableCell>
                          <TableCell className="text-right text-sm">{row.usageCount}</TableCell>
                          <TableCell className="text-right text-sm">{row.totalQuantity}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.totalRevenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !partsData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Job Analytics Tab */}
      <TabsContent value="job-analytics">
        {!loading && jobAnalyticsData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 max-w-lg">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("jobAnalytics.totalJobs")}</p>
                    <p className="text-lg font-semibold">{jobAnalyticsData.totalJobs}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("jobAnalytics.avgJobValue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(jobAnalyticsData.avgJobValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("jobAnalytics.jobsByDayOfWeek")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DayOfWeekChart data={jobAnalyticsData.dayOfWeek} labels={{ jobs: t("charts.jobs") }} />
                </CardContent>
              </Card>
              {jobAnalyticsData.topServiceTypes.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("jobAnalytics.serviceTypes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ServiceTypeAnalyticsDonut data={jobAnalyticsData.topServiceTypes} />
                  </CardContent>
                </Card>
              )}
            </div>
            {jobAnalyticsData.monthlyTrend.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("jobAnalytics.monthlyTrend")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <MonthlyTrendChart
                    data={jobAnalyticsData.monthlyTrend}
                    formatCurrency={fmtCurrency}
                    labels={{ jobs: t("charts.jobs"), revenue: t("charts.revenue") }}
                  />
                </CardContent>
              </Card>
            )}
            {jobAnalyticsData.topServiceTypes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("jobAnalytics.serviceTypeBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("jobAnalytics.tableHeaders.type")}</TableHead>
                        <TableHead className="text-right">{t("jobAnalytics.tableHeaders.count")}</TableHead>
                        <TableHead className="text-right">{t("jobAnalytics.tableHeaders.avgValue")}</TableHead>
                        <TableHead className="text-right">{t("jobAnalytics.tableHeaders.avgHours")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobAnalyticsData.topServiceTypes.map((row) => (
                        <TableRow key={row.type}>
                          <TableCell className="text-sm font-medium">{row.type}</TableCell>
                          <TableCell className="text-right text-sm">{row.count}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.avgValue)}</TableCell>
                          <TableCell className="text-right text-sm">{row.avgHours.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !jobAnalyticsData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Retention Tab */}
      <TabsContent value="retention">
        {!loading && retentionData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                    <UserCheck className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("retention.returning")}</p>
                    <p className="text-lg font-semibold">{retentionData.returningCustomers}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("retention.new")}</p>
                    <p className="text-lg font-semibold">{retentionData.newCustomers}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
                    <Users className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("retention.totalActive")}</p>
                    <p className="text-lg font-semibold">{retentionData.totalActive}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                    <CalendarDays className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("retention.avgDaysBetween")}</p>
                    <p className="text-lg font-semibold">
                      {retentionData.avgTimeBetweenVisits ?? "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {retentionData.topReturning.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("retention.topReturningCustomers")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RetentionBarChart
                    data={retentionData.topReturning}
                    formatCurrency={fmtCurrency}
                    labels={{ visits: t("charts.visits"), totalSpent: t("charts.totalSpent") }}
                  />
                </CardContent>
              </Card>
            )}
            {retentionData.topReturning.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("retention.returningCustomers")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("retention.tableHeaders.customer")}</TableHead>
                        <TableHead>{t("retention.tableHeaders.company")}</TableHead>
                        <TableHead className="text-right">{t("retention.tableHeaders.visits")}</TableHead>
                        <TableHead className="text-right">{t("retention.tableHeaders.totalSpent")}</TableHead>
                        <TableHead className="text-right">{t("retention.tableHeaders.avgDaysBetween")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retentionData.topReturning.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm">{row.company ?? "-"}</TableCell>
                          <TableCell className="text-right text-sm">{row.visitCount}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.totalSpent)}</TableCell>
                          <TableCell className="text-right text-sm">{row.avgTimeBetweenVisits ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !retentionData && <EmptyState message={t("empty")} />}
      </TabsContent>

      {/* Tax Tab */}
      <TabsContent value="tax">
        {!loading && taxData && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                    <Receipt className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("tax.totalTaxCollected")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(taxData.summary.totalTaxCollected)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <DollarSign className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("tax.taxableRevenue")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(taxData.summary.totalTaxableAmount)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
                    <BarChart3 className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("tax.invoicesWithTax")}</p>
                    <p className="text-lg font-semibold">{taxData.summary.totalInvoices}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {taxData.monthly.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("tax.monthlyTaxCollected")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TaxBarChart
                    data={taxData.monthly}
                    formatCurrency={fmtCurrency}
                    labels={{ taxCollected: t("charts.taxCollected") }}
                  />
                </CardContent>
              </Card>
            )}

            {taxData.byRate.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("tax.taxByRate")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tax.tableHeaders.taxRate")}</TableHead>
                        <TableHead className="text-right">{t("tax.tableHeaders.taxCollected")}</TableHead>
                        <TableHead className="text-right">{t("tax.tableHeaders.invoices")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxData.byRate.map((row) => (
                        <TableRow key={row.taxRate}>
                          <TableCell className="text-sm font-medium">{row.taxRate}%</TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.taxCollected)}
                          </TableCell>
                          <TableCell className="text-right text-sm">{row.invoiceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {taxData.monthly.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("tax.monthlyBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tax.tableHeaders.month")}</TableHead>
                        <TableHead className="text-right">{t("tax.tableHeaders.taxCollected")}</TableHead>
                        <TableHead className="text-right">{t("tax.tableHeaders.taxableAmount")}</TableHead>
                        <TableHead className="text-right">{t("tax.tableHeaders.invoices")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxData.monthly.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="text-sm">{row.month}</TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.taxCollected)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {fmtCurrency(row.taxableAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm">{row.invoiceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {!loading && !taxData && <EmptyState message={t("empty")} />}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}
