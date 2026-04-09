"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CalendarIcon,
  CalendarDays,
  FileText,
  UserCheck,
  Receipt,
  Clock,
  ArrowUpDown,
  Landmark,
  Car,
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
  getPastDueInvoicesReport,
  getVehicleReport,
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
  PastDueInvoicesReport,
  VehicleReportData,
} from "@/features/reports/Schema/reportTypes";
import { RevenueBarChart, RevenueTypeDonut } from "@/features/reports/Components/RevenueCharts";
import { ServiceStatusChart, ServiceTypeDonut } from "@/features/reports/Components/ServiceCharts";
import { TopCustomersChart } from "@/features/reports/Components/CustomerCharts";
import { TechnicianBarChart } from "@/features/reports/Components/TechnicianCharts";
import { PartsDonut } from "@/features/reports/Components/PartsCharts";
import { DayOfWeekChart, ServiceTypeAnalyticsDonut, MonthlyTrendChart } from "@/features/reports/Components/JobAnalyticsCharts";
import { RetentionBarChart } from "@/features/reports/Components/RetentionCharts";
import { TaxBarChart } from "@/features/reports/Components/TaxCharts";
import { VehicleCostBarChart } from "@/features/reports/Components/VehicleCharts";
import { VehicleCombobox } from "@/features/quotes/Components/VehicleCombobox";
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
  exportPastDueInvoicesCsv,
  exportVehicleReportCsv,
} from "@/features/reports/Components/csv-export";
import { ReportPDF } from "@/features/reports/Components/ReportPDF";
import { pdf } from "@react-pdf/renderer";

type ReportTab = "financial" | "services" | "customers" | "inventory" | "technicians" | "parts" | "job-analytics" | "retention" | "vehicles";
type FinancialSubTab = "revenue" | "past-due-invoices" | "tax";
type PastDueSortKey = "customerName" | "amountDue" | "daysPastDue";
type PastDueSortDir = "asc" | "desc";

interface ReportsClientProps {
  currencyCode: string;
  primaryColor: string;
  organizationName: string;
}

const VALID_TABS: ReportTab[] = ["financial", "services", "customers", "inventory", "technicians", "parts", "job-analytics", "retention", "vehicles"];
const VALID_SUB_TABS: FinancialSubTab[] = ["revenue", "past-due-invoices", "tax"];

export default function ReportsClient({ currencyCode, primaryColor, organizationName }: ReportsClientProps) {
  const t = useTranslations("reports");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  const initialTab = (VALID_TABS.includes(searchParams.get("tab") as ReportTab) ? searchParams.get("tab") : "financial") as ReportTab;
  const initialSubTab = (VALID_SUB_TABS.includes(searchParams.get("subtab") as FinancialSubTab) ? searchParams.get("subtab") : "revenue") as FinancialSubTab;

  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [financialSubTab, setFinancialSubTab] = useState<FinancialSubTab>(initialSubTab);

  const updateUrl = useCallback((tab: string, subtab?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (subtab) {
      params.set("subtab", subtab);
    } else {
      params.delete("subtab");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(currentYear, 0, 1),
    to: new Date(),
  });
  const [pendingDateRange, setPendingDateRange] = useState<DateRange>(dateRange);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Past due invoices state
  const [pastDueFilter, setPastDueFilter] = useState<string>("all");
  const [pastDueSortKey, setPastDueSortKey] = useState<PastDueSortKey>("daysPastDue");
  const [pastDueSortDir, setPastDueSortDir] = useState<PastDueSortDir>("desc");

  const [revenueData, setRevenueData] = useState<RevenueReport | null>(null);
  const [serviceData, setServiceData] = useState<ServiceReport | null>(null);
  const [customerData, setCustomerData] = useState<CustomerReport | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReport | null>(null);
  const [technicianData, setTechnicianData] = useState<TechnicianReport | null>(null);
  const [partsData, setPartsData] = useState<PartsUsageReport | null>(null);
  const [jobAnalyticsData, setJobAnalyticsData] = useState<JobAnalyticsReport | null>(null);
  const [retentionData, setRetentionData] = useState<CustomerRetentionReport | null>(null);
  const [taxData, setTaxData] = useState<TaxReport | null>(null);
  const [pastDueData, setPastDueData] = useState<PastDueInvoicesReport | null>(null);
  const [vehicleData, setVehicleData] = useState<VehicleReportData | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");

  const fmtCurrency = useCallback(
    (value: number) => formatCurrency(value, currencyCode),
    [currencyCode],
  );

  type FetchableReport = ReportTab | FinancialSubTab;

  const fetchReport = useCallback(
    async (type: FetchableReport, overrideDateRange?: DateRange, overrideVehicleId?: string) => {
      const range = overrideDateRange ?? dateRange;
      setLoading(true);
      try {
        const dateParams = {
          startDate: range.from ? format(range.from, "yyyy-MM-dd") : "",
          endDate: range.to ? format(range.to, "yyyy-MM-dd") : "",
        };
        switch (type) {
          case "revenue": {
            const result = await getRevenueReport(dateParams);
            if (result.success && result.data) setRevenueData(result.data);
            break;
          }
          case "past-due-invoices": {
            const result = await getPastDueInvoicesReport();
            if (result.success && result.data) setPastDueData(result.data);
            break;
          }
          case "tax": {
            const result = await getTaxReport(dateParams);
            if (result.success && result.data) setTaxData(result.data);
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
          case "vehicles": {
            const vid = overrideVehicleId ?? selectedVehicleId;
            if (!vid) break;
            const result = await getVehicleReport({ ...dateParams, vehicleId: vid });
            if (result.success && result.data) setVehicleData(result.data);
            break;
          }
        }
      } catch (error) {
        console.error("Failed to fetch report:", error);
      } finally {
        setLoading(false);
      }
    },
    [dateRange, selectedVehicleId],
  );

  // Auto-fetch current tab on mount
  useEffect(() => {
    if (activeTab === "financial") {
      fetchReport(financialSubTab);
    } else {
      fetchReport(activeTab);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (value: string) => {
    const tab = value as ReportTab;
    setActiveTab(tab);
    updateUrl(tab, tab === "financial" ? financialSubTab : undefined);
    if (tab === "financial") {
      const subDataMap: Record<FinancialSubTab, unknown> = {
        revenue: revenueData,
        "past-due-invoices": pastDueData,
        tax: taxData,
      };
      if (!subDataMap[financialSubTab]) {
        fetchReport(financialSubTab);
      }
    } else {
      const dataMap: Record<string, unknown> = {
        services: serviceData,
        customers: customerData,
        inventory: inventoryData,
        technicians: technicianData,
        parts: partsData,
        "job-analytics": jobAnalyticsData,
        retention: retentionData,
        vehicles: vehicleData,
      };
      if (!dataMap[tab]) {
        if (tab === "vehicles") {
          if (selectedVehicleId) fetchReport(tab);
        } else {
          fetchReport(tab);
        }
      }
    }
  };

  const handleFinancialSubTabChange = (value: string) => {
    const subTab = value as FinancialSubTab;
    setFinancialSubTab(subTab);
    updateUrl("financial", subTab);
    const subDataMap: Record<FinancialSubTab, unknown> = {
      revenue: revenueData,
      "past-due-invoices": pastDueData,
      tax: taxData,
    };
    if (!subDataMap[subTab]) {
      fetchReport(subTab);
    }
  };

  const handleRefresh = () => {
    if (activeTab === "financial") {
      fetchReport(financialSubTab);
    } else if (activeTab === "vehicles") {
      if (selectedVehicleId) fetchReport("vehicles");
    } else {
      fetchReport(activeTab);
    }
  };

  const handleExport = () => {
    const h = (key: string) => t(`csvHeaders.${key}`);
    if (activeTab === "financial") {
      switch (financialSubTab) {
        case "revenue":
          if (revenueData) exportRevenueCsv(revenueData, currencyCode, [h("month"), h("revenue"), h("collected"), h("count"), h("partsCost"), h("partsNetProfit"), h("laborRevenue"), h("netProfit")]);
          break;
        case "past-due-invoices":
          if (pastDueData) exportPastDueInvoicesCsv(pastDueData, currencyCode, [h("customer"), h("company"), h("invoiceNumber"), h("totalAmount"), h("amountPaid"), h("amountDue"), h("dueDate"), h("daysPastDue")]);
          break;
        case "tax":
          if (taxData) exportTaxCsv(taxData, currencyCode, [h("month"), h("taxCollected"), h("taxableAmount"), h("invoiceCount")]);
          break;
      }
    } else {
      switch (activeTab) {
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
          if (partsData) exportPartsCsv(partsData, currencyCode, [h("partName"), h("partNumber"), h("usageCount"), h("totalQty"), h("totalRevenue"), h("partsCost"), h("netProfit")]);
          break;
        case "job-analytics":
          if (jobAnalyticsData) exportJobAnalyticsCsv(jobAnalyticsData, currencyCode, [h("serviceType"), h("count"), h("avgValue"), h("avgHours")]);
          break;
        case "retention":
          if (retentionData) exportRetentionCsv(retentionData, currencyCode, [h("customer"), h("company"), h("visits"), h("totalSpent"), h("avgDaysBetweenVisits")]);
          break;
        case "vehicles":
          if (vehicleData) exportVehicleReportCsv(vehicleData, currencyCode, [h("date"), h("title"), h("type"), h("status"), h("totalAmount"), h("partsUsed"), h("laborHours")]);
          break;
      }
    }
  };

  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePdfExport = async () => {
    setPdfLoading(true);
    try {
      const from = dateRange.from ? format(dateRange.from, "LLL dd, y") : "";
      const to = dateRange.to ? format(dateRange.to, "LLL dd, y") : "";
      const dateRangeStr = from && to ? `${from} – ${to}` : from || to;

      const labels: Record<string, string> = {
        reportTitle: t("pdf.reportTitle"),
        revenueSection: t("pdf.revenueSection"),
        taxSection: t("pdf.taxSection"),
        pastDueSection: t("pdf.pastDueSection"),
        servicesSection: t("pdf.servicesSection"),
        customersSection: t("pdf.customersSection"),
        techniciansSection: t("pdf.techniciansSection"),
        partsSection: t("pdf.partsSection"),
        jobAnalyticsSection: t("pdf.jobAnalyticsSection"),
        retentionSection: t("pdf.retentionSection"),
        inventorySection: t("pdf.inventorySection"),
        monthlyBreakdown: t("pdf.monthlyBreakdown"),
        revenueByType: t("pdf.revenueByType"),
        taxByRate: t("pdf.taxByRate"),
        servicesByStatus: t("pdf.servicesByStatus"),
        servicesByType: t("pdf.servicesByType"),
        topCustomers: t("pdf.topCustomers"),
        topServiceTypes: t("pdf.topServiceTypes"),
        topReturning: t("pdf.topReturning"),
        dayOfWeek: t("pdf.dayOfWeek"),
        monthlyTrend: t("pdf.monthlyTrend"),
        lowStock: t("pdf.lowStock"),
        // common labels
        revenue: t("pdf.revenue"),
        collected: t("pdf.collected"),
        outstanding: t("pdf.outstanding"),
        services: t("pdf.services"),
        partsCost: t("pdf.partsCost"),
        partsNetProfit: t("pdf.partsNetProfit"),
        laborRevenue: t("pdf.laborRevenue"),
        netProfit: t("pdf.netProfit"),
        month: t("pdf.month"),
        count: t("pdf.count"),
        type: t("pdf.type"),
        status: t("pdf.status"),
        name: t("pdf.name"),
        company: t("pdf.company"),
        totalSpent: t("pdf.totalSpent"),
        customer: t("pdf.customer"),
        invoiceNumber: t("pdf.invoiceNumber"),
        totalAmount: t("pdf.totalAmount"),
        amountDue: t("pdf.amountDue"),
        dueDate: t("pdf.dueDate"),
        daysPastDue: t("pdf.daysPastDue"),
        totalPastDue: t("pdf.totalPastDue"),
        totalAmountDue: t("pdf.totalAmountDue"),
        over30: t("pdf.over30"),
        over60: t("pdf.over60"),
        over90: t("pdf.over90"),
        taxCollected: t("pdf.taxCollected"),
        taxableAmount: t("pdf.taxableAmount"),
        taxRate: t("pdf.taxRate"),
        invoiceCount: t("pdf.invoiceCount"),
        invoices: t("pdf.invoices"),
        totalServices: t("pdf.totalServices"),
        totalCustomers: t("pdf.totalCustomers"),
        activeCustomers: t("pdf.activeCustomers"),
        technician: t("pdf.technician"),
        jobs: t("pdf.jobs"),
        totalRevenue: t("pdf.totalRevenue"),
        avgRevenue: t("pdf.avgRevenue"),
        totalHours: t("pdf.totalHours"),
        avgHours: t("pdf.avgHours"),
        totalJobs: t("pdf.totalJobs"),
        partName: t("pdf.partName"),
        partNumber: t("pdf.partNumber"),
        usageCount: t("pdf.usageCount"),
        totalQty: t("pdf.totalQty"),
        totalPartsRevenue: t("pdf.totalPartsRevenue"),
        totalPartsCost: t("pdf.totalPartsCost"),
        totalPartsNetProfit: t("pdf.totalPartsNetProfit"),
        totalPartsUsed: t("pdf.totalPartsUsed"),
        serviceType: t("pdf.serviceType"),
        avgValue: t("pdf.avgValue"),
        avgJobValue: t("pdf.avgJobValue"),
        returningCustomers: t("pdf.returningCustomers"),
        newCustomers: t("pdf.newCustomers"),
        totalActive: t("pdf.totalActive"),
        avgTimeBetweenVisits: t("pdf.avgTimeBetweenVisits"),
        avgDaysBetweenVisits: t("pdf.avgDaysBetweenVisits"),
        visits: t("pdf.visits"),
        days: t("pdf.days"),
        totalParts: t("pdf.totalParts"),
        totalItems: t("pdf.totalItems"),
        totalValue: t("pdf.totalValue"),
        totalSellValue: t("pdf.totalSellValue"),
        quantity: t("pdf.quantity"),
        minQuantity: t("pdf.minQuantity"),
        unitCost: t("pdf.unitCost"),
        vehiclesSection: t("pdf.vehiclesSection"),
        vehicleLabel: t("pdf.vehicleLabel"),
        totalCost: t("pdf.totalCost"),
        partsCostLabel: t("pdf.partsCostLabel"),
        laborCostLabel: t("pdf.laborCostLabel"),
        date: t("pdf.date"),
        repairs: t("vehicles.repairs"),
        maintenance: t("vehicles.maintenance"),
        upgrades: t("vehicles.upgrades"),
        inspections: t("vehicles.inspections"),
        totalLaborHours: t("vehicles.totalLaborHours"),
        serviceHistory: t("vehicles.serviceHistory"),
        serviceTypeBreakdown: t("vehicles.serviceTypeBreakdown"),
      };

      // Only include data for the current tab
      const pdfProps: Record<string, unknown> = {};
      let filename = "report";
      if (activeTab === "financial") {
        if (financialSubTab === "revenue") { pdfProps.revenueData = revenueData; filename = "revenue-report"; }
        else if (financialSubTab === "tax") { pdfProps.taxData = taxData; filename = "tax-report"; }
        else if (financialSubTab === "past-due-invoices") { pdfProps.pastDueData = pastDueData; filename = "past-due-invoices-report"; }
      } else {
        filename = `${activeTab}-report`;
        const dataMap: Record<string, [string, unknown]> = {
          services: ["serviceData", serviceData],
          customers: ["customerData", customerData],
          inventory: ["inventoryData", inventoryData],
          technicians: ["technicianData", technicianData],
          parts: ["partsData", partsData],
          "job-analytics": ["jobAnalyticsData", jobAnalyticsData],
          retention: ["retentionData", retentionData],
          vehicles: ["vehicleData", vehicleData],
        };
        const entry = dataMap[activeTab];
        if (entry) pdfProps[entry[0] as string] = entry[1];
      }

      const blob = await pdf(
        <ReportPDF
          dateRange={dateRangeStr}
          currencyCode={currencyCode}
          primaryColor={primaryColor}
          organizationName={organizationName}
          labels={labels}
          {...pdfProps}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setPdfLoading(false);
    }
  };

  // Determine if we have data for the current view
  const hasData = (() => {
    if (activeTab === "financial") {
      const subDataMap: Record<FinancialSubTab, unknown> = {
        revenue: revenueData,
        "past-due-invoices": pastDueData,
        tax: taxData,
      };
      return !!subDataMap[financialSubTab];
    }
    const dataMap: Record<string, unknown> = {
      services: serviceData,
      customers: customerData,
      inventory: inventoryData,
      technicians: technicianData,
      parts: partsData,
      "job-analytics": jobAnalyticsData,
      retention: retentionData,
      vehicles: vehicleData,
    };
    return !!dataMap[activeTab];
  })();

  const showDateRange = activeTab !== "inventory" && !(activeTab === "financial" && financialSubTab === "past-due-invoices");

  // Past due invoice sorting and filtering
  const sortedFilteredPastDue = pastDueData ? (() => {
    let filtered = pastDueData.invoices;
    if (pastDueFilter === "30") filtered = filtered.filter((inv) => inv.daysPastDue > 30);
    else if (pastDueFilter === "60") filtered = filtered.filter((inv) => inv.daysPastDue > 60);
    else if (pastDueFilter === "90") filtered = filtered.filter((inv) => inv.daysPastDue > 90);

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (pastDueSortKey === "customerName") cmp = a.customerName.localeCompare(b.customerName);
      else if (pastDueSortKey === "amountDue") cmp = a.amountDue - b.amountDue;
      else if (pastDueSortKey === "daysPastDue") cmp = a.daysPastDue - b.daysPastDue;
      return pastDueSortDir === "asc" ? cmp : -cmp;
    });
  })() : [];

  const toggleSort = (key: PastDueSortKey) => {
    if (pastDueSortKey === key) {
      setPastDueSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPastDueSortKey(key);
      setPastDueSortDir("desc");
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {/* Tab bar with date range and actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="financial" className="gap-1.5">
            <Landmark className="h-4 w-4" />
            {t("tabs.financial")}
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
          <TabsTrigger value="vehicles" className="gap-1.5">
            <Car className="h-4 w-4" />
            {t("tabs.vehicles")}
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          {showDateRange && (
            <Popover open={datePickerOpen} onOpenChange={(open) => {
              setDatePickerOpen(open);
              if (open) setPendingDateRange(dateRange);
            }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateRange.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} –{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>{t("dateRange.pickDate")}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  defaultMonth={dateRange.to ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth() - 1) : dateRange.from}
                  selected={pendingDateRange}
                  onSelect={(range) => range && setPendingDateRange(range)}
                  numberOfMonths={2}
                />
                <div className="border-t p-3 flex justify-end">
                  <Button
                    size="sm"
                    disabled={!pendingDateRange.from || !pendingDateRange.to}
                    onClick={() => {
                      setDateRange(pendingDateRange);
                      setDatePickerOpen(false);
                      if (activeTab === "financial") {
                        fetchReport(financialSubTab, pendingDateRange);
                      } else {
                        fetchReport(activeTab, pendingDateRange);
                      }
                    }}
                  >
                    {t("dateRange.apply")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("actions.refresh")}
          </Button>
          {hasData && (
            <>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("actions.csv")}
              </Button>
              <Button size="sm" variant="outline" onClick={handlePdfExport} disabled={pdfLoading}>
                {pdfLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("actions.pdf")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Financial Reports Tab */}
      <TabsContent value="financial">
        <Tabs value={financialSubTab} onValueChange={handleFinancialSubTabChange} className="space-y-4">
          <TabsList variant="line">
            <TabsTrigger value="revenue" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              {t("tabs.revenue")}
            </TabsTrigger>
            <TabsTrigger value="past-due-invoices" className="gap-1.5">
              <Clock className="h-4 w-4" />
              {t("tabs.pastDueInvoices")}
            </TabsTrigger>
            <TabsTrigger value="tax" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              {t("tabs.tax")}
            </TabsTrigger>
          </TabsList>

          {/* Revenue Sub-Tab */}
          <TabsContent value="revenue">
            {!loading && revenueData && (
              <div className="space-y-4">
                {/* Top-line metrics */}
                <div className="grid gap-2 grid-cols-3">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="px-3 py-1.5">
                      <p className="text-[11px] text-muted-foreground">{t("revenue.revenue")}</p>
                      <p className="text-base font-semibold truncate">{fmtCurrency(revenueData.summary.totalRevenue)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="px-3 py-1.5">
                      <p className="text-[11px] text-muted-foreground">{t("revenue.collected")}</p>
                      <p className="text-base font-semibold truncate">{fmtCurrency(revenueData.summary.totalCollected)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="px-3 py-1.5">
                      <p className="text-[11px] text-muted-foreground">{t("revenue.outstanding")}</p>
                      <p className="text-base font-semibold truncate">{fmtCurrency(revenueData.summary.outstanding)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Net Profit breakdown */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("revenue.netProfit")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          <span className="text-sm text-muted-foreground">{t("revenue.partsNetProfit")}</span>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{fmtCurrency(revenueData.summary.totalPartsNetProfit)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                          <span className="text-sm text-muted-foreground">{t("revenue.laborRevenue")}</span>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{fmtCurrency(revenueData.summary.totalLaborRevenue)}</span>
                      </div>
                      <div className="border-t pt-3 flex items-center justify-between">
                        <span className="text-sm font-medium">{t("revenue.netProfit")}</span>
                        <span className="text-base font-semibold tabular-nums">{fmtCurrency(revenueData.summary.netProfit)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-5">
                  <Card className="border-0 shadow-sm lg:col-span-3">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{t("revenue.monthlyRevenue")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RevenueBarChart
                        data={revenueData.monthly}
                        formatCurrency={fmtCurrency}
                        labels={{ revenue: t("charts.revenue"), collected: t("charts.collected"), netProfit: t("revenue.netProfit") }}
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
                            <TableHead className="text-right">{t("revenue.tableHeaders.partsCost")}</TableHead>
                            <TableHead className="text-right">{t("revenue.tableHeaders.partsNetProfit")}</TableHead>
                            <TableHead className="text-right">{t("revenue.tableHeaders.laborRevenue")}</TableHead>
                            <TableHead className="text-right">{t("revenue.tableHeaders.netProfit")}</TableHead>
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
                              <TableCell className="text-right text-sm">
                                {fmtCurrency(row.partsCost)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {fmtCurrency(row.partsNetProfit)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {fmtCurrency(row.laborRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {fmtCurrency(row.netProfit)}
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

          {/* Past Due Invoices Sub-Tab */}
          <TabsContent value="past-due-invoices">
            {!loading && pastDueData && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("pastDueInvoices.totalPastDue")}</p>
                        <p className="text-lg font-semibold">{pastDueData.summary.totalPastDue}</p>
                        <p className="text-[10px] leading-tight text-muted-foreground/70">{t("pastDueInvoices.totalPastDueDesc")}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                        <DollarSign className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("pastDueInvoices.totalAmountDue")}</p>
                        <p className="text-lg font-semibold truncate">{fmtCurrency(pastDueData.summary.totalAmountDue)}</p>
                        <p className="text-[10px] leading-tight text-muted-foreground/70">{t("pastDueInvoices.totalAmountDueDesc")}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                        <Clock className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("pastDueInvoices.over30Days")}</p>
                        <p className="text-lg font-semibold">{pastDueData.summary.over30}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                        <Clock className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("pastDueInvoices.over60Days")}</p>
                        <p className="text-lg font-semibold">{pastDueData.summary.over60}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-600/10">
                        <Clock className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("pastDueInvoices.over90Days")}</p>
                        <p className="text-lg font-semibold">{pastDueData.summary.over90}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Filter and table */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{t("pastDueInvoices.pastDueInvoicesList")}</CardTitle>
                      <Select value={pastDueFilter} onValueChange={setPastDueFilter}>
                        <SelectTrigger className="w-[160px] h-8 text-sm">
                          <SelectValue placeholder={t("pastDueInvoices.filterByAge")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("pastDueInvoices.allPastDue")}</SelectItem>
                          <SelectItem value="30">{t("pastDueInvoices.30plus")}</SelectItem>
                          <SelectItem value="60">{t("pastDueInvoices.60plus")}</SelectItem>
                          <SelectItem value="90">{t("pastDueInvoices.90plus")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {sortedFilteredPastDue.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <button
                                type="button"
                                className="flex items-center gap-1 hover:text-foreground"
                                onClick={() => toggleSort("customerName")}
                              >
                                {t("pastDueInvoices.tableHeaders.customer")}
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">{t("pastDueInvoices.tableHeaders.company")}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t("pastDueInvoices.tableHeaders.invoiceNumber")}</TableHead>
                            <TableHead className="hidden lg:table-cell">{t("pastDueInvoices.tableHeaders.vehicle")}</TableHead>
                            <TableHead className="text-right">
                              <button
                                type="button"
                                className="flex items-center gap-1 ml-auto hover:text-foreground"
                                onClick={() => toggleSort("amountDue")}
                              >
                                {t("pastDueInvoices.tableHeaders.amountDue")}
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </TableHead>
                            <TableHead className="text-right hidden sm:table-cell">{t("pastDueInvoices.tableHeaders.totalAmount")}</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">{t("pastDueInvoices.tableHeaders.amountPaid")}</TableHead>
                            <TableHead className="text-right hidden md:table-cell">{t("pastDueInvoices.tableHeaders.dueDate")}</TableHead>
                            <TableHead className="text-right">
                              <button
                                type="button"
                                className="flex items-center gap-1 ml-auto hover:text-foreground"
                                onClick={() => toggleSort("daysPastDue")}
                              >
                                {t("pastDueInvoices.tableHeaders.daysPastDue")}
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedFilteredPastDue.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="text-sm font-medium">{inv.customerName}</TableCell>
                              <TableCell className="text-sm hidden md:table-cell">{inv.customerCompany ?? "-"}</TableCell>
                              <TableCell className="text-sm hidden lg:table-cell">{inv.invoiceNumber ?? "-"}</TableCell>
                              <TableCell className="text-sm hidden lg:table-cell">{inv.vehicleInfo}</TableCell>
                              <TableCell className="text-right text-sm font-medium text-red-600 dark:text-red-400">
                                {fmtCurrency(inv.amountDue)}
                              </TableCell>
                              <TableCell className="text-right text-sm hidden sm:table-cell">{fmtCurrency(inv.totalAmount)}</TableCell>
                              <TableCell className="text-right text-sm hidden sm:table-cell">{fmtCurrency(inv.amountPaid)}</TableCell>
                              <TableCell className="text-right text-sm hidden md:table-cell">{inv.dueDate}</TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={inv.daysPastDue > 90 ? "destructive" : inv.daysPastDue > 60 ? "destructive" : inv.daysPastDue > 30 ? "outline" : "secondary"}
                                  className={inv.daysPastDue > 60 ? "" : inv.daysPastDue > 30 ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}
                                >
                                  {inv.daysPastDue}d
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {t("pastDueInvoices.noInvoices")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            {!loading && !pastDueData && <EmptyState message={t("empty")} />}
          </TabsContent>

          {/* Tax Sub-Tab */}
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
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                    <Package className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("parts.partsCost")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(partsData.totalPartsCost)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-500/10">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("parts.netProfit")}</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(partsData.totalPartsNetProfit)}
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
                        <TableHead className="text-right">{t("parts.tableHeaders.cost")}</TableHead>
                        <TableHead className="text-right">{t("parts.tableHeaders.netProfit")}</TableHead>
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
                          <TableCell className="text-right text-sm">{fmtCurrency(row.totalCost)}</TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(row.netProfit)}</TableCell>
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

      {/* Vehicle Reports Tab */}
      <TabsContent value="vehicles">
        <div className="mb-4 max-w-md">
          <VehicleCombobox
            value={selectedVehicleId}
            onChange={(id) => {
              setSelectedVehicleId(id);
              setVehicleData(null);
              if (id) {
                fetchReport("vehicles", undefined, id);
              }
            }}
            placeholder={t("vehicles.selectVehicle")}
            noneLabel="—"
          />
        </div>

        {!loading && vehicleData && (
          <div className="space-y-4">
            {/* Vehicle header with inline stats */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                      <Car className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-semibold">
                        {vehicleData.vehicleInfo.year} {vehicleData.vehicleInfo.make} {vehicleData.vehicleInfo.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[vehicleData.vehicleInfo.licensePlate, vehicleData.vehicleInfo.vin, vehicleData.vehicleInfo.customerName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                    <span><span className="text-muted-foreground">{t("vehicles.totalServices")}:</span> <span className="font-medium">{vehicleData.summary.totalServices}</span></span>
                    <span><span className="text-muted-foreground">{t("vehicles.totalCost")}:</span> <span className="font-medium">{fmtCurrency(vehicleData.summary.totalCost)}</span></span>
                    <span><span className="text-muted-foreground">{t("vehicles.totalPartsUsed")}:</span> <span className="font-medium">{vehicleData.summary.totalPartsUsed}</span></span>
                    <span><span className="text-muted-foreground">{t("vehicles.totalLaborHours")}:</span> <span className="font-medium">{vehicleData.summary.totalLaborHours.toFixed(1)}</span></span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts row */}
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="border-0 shadow-sm lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("vehicles.monthlyCosts")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <VehicleCostBarChart
                    data={vehicleData.monthlyCosts}
                    formatCurrency={fmtCurrency}
                    labels={{ partsCost: t("charts.partsCost"), laborCost: t("charts.laborCost") }}
                  />
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t("vehicles.serviceTypeBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {vehicleData.serviceTypeBreakdown.map((item) => {
                      const pct = vehicleData.summary.totalCost > 0
                        ? (item.totalCost / vehicleData.summary.totalCost) * 100
                        : 0;
                      return (
                        <div key={item.type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm capitalize">{item.type}</span>
                            <span className="text-sm font-medium tabular-nums">{fmtCurrency(item.totalCost)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                              {item.count} · {pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {vehicleData.serviceTypeBreakdown.length > 0 && (
                      <div className="border-t pt-3 flex items-center justify-between">
                        <span className="text-sm font-medium">{t("vehicles.totalCost")}</span>
                        <span className="text-sm font-semibold tabular-nums">{fmtCurrency(vehicleData.summary.totalCost)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Parts + Service History side by side on large screens */}
            <div className="grid gap-4 lg:grid-cols-5">
              {vehicleData.topParts.length > 0 && (
                <Card className="border-0 shadow-sm lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("vehicles.topParts")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("vehicles.tableHeaders.partName")}</TableHead>
                          <TableHead className="text-right">{t("vehicles.tableHeaders.quantity")}</TableHead>
                          <TableHead className="text-right">{t("vehicles.tableHeaders.cost")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vehicleData.topParts.map((part, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">
                              <span className="font-medium">{part.name}</span>
                              {part.partNumber && <span className="text-muted-foreground ml-1.5 text-xs">#{part.partNumber}</span>}
                            </TableCell>
                            <TableCell className="text-right text-sm">{part.quantity}</TableCell>
                            <TableCell className="text-right text-sm">{fmtCurrency(part.totalCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {vehicleData.serviceHistory.length > 0 && (
                <Card className={cn("border-0 shadow-sm", vehicleData.topParts.length > 0 ? "lg:col-span-3" : "lg:col-span-5")}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t("vehicles.serviceHistory")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("vehicles.tableHeaders.date")}</TableHead>
                          <TableHead>{t("vehicles.tableHeaders.title")}</TableHead>
                          <TableHead>{t("vehicles.tableHeaders.type")}</TableHead>
                          <TableHead className="text-right">{t("vehicles.tableHeaders.totalAmount")}</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">{t("vehicles.tableHeaders.laborHours")}</TableHead>
                          <TableHead className="hidden md:table-cell">{t("vehicles.tableHeaders.techName")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vehicleData.serviceHistory.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm text-muted-foreground">{row.date}</TableCell>
                            <TableCell className="text-sm font-medium">{row.title}</TableCell>
                            <TableCell className="text-sm">
                              <Badge variant="secondary">{row.type}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">{fmtCurrency(row.totalAmount)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell">{row.laborHours.toFixed(1)}</TableCell>
                            <TableCell className="text-sm hidden md:table-cell">{row.techName ?? "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
        {!loading && !vehicleData && !selectedVehicleId && (
          <EmptyState message={t("vehicles.selectVehiclePrompt")} />
        )}
        {!loading && !vehicleData && selectedVehicleId && (
          <EmptyState message={t("empty")} />
        )}
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
