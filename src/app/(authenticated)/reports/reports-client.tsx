"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  getRevenueReport,
  getServiceReport,
  getCustomerReport,
  getInventoryReport,
} from "@/features/reports/Actions/reportActions";
import { formatCurrency } from "@/lib/format";
import type {
  RevenueReport,
  ServiceReport,
  CustomerReport,
  InventoryReport,
} from "@/features/reports/Schema/reportTypes";
import { RevenueBarChart, RevenueTypeDonut } from "@/features/reports/Components/RevenueCharts";
import { ServiceStatusChart, ServiceTypeDonut } from "@/features/reports/Components/ServiceCharts";
import { TopCustomersChart } from "@/features/reports/Components/CustomerCharts";
import {
  exportRevenueCsv,
  exportServicesCsv,
  exportCustomersCsv,
  exportInventoryCsv,
} from "@/features/reports/Components/csv-export";

type ReportTab = "revenue" | "services" | "customers" | "inventory";

interface ReportsClientProps {
  currencyCode: string;
}

export default function ReportsClient({ currencyCode }: ReportsClientProps) {
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
    // Fetch if not already loaded
    if (
      (tab === "revenue" && !revenueData) ||
      (tab === "services" && !serviceData) ||
      (tab === "customers" && !customerData) ||
      (tab === "inventory" && !inventoryData)
    ) {
      fetchReport(tab);
    }
  };

  const handleRefresh = () => {
    fetchReport(activeTab);
  };

  const handleExport = () => {
    switch (activeTab) {
      case "revenue":
        if (revenueData) exportRevenueCsv(revenueData, currencyCode);
        break;
      case "services":
        if (serviceData) exportServicesCsv(serviceData);
        break;
      case "customers":
        if (customerData) exportCustomersCsv(customerData, currencyCode);
        break;
      case "inventory":
        if (inventoryData) exportInventoryCsv(inventoryData, currencyCode);
        break;
    }
  };

  const hasData =
    (activeTab === "revenue" && revenueData) ||
    (activeTab === "services" && serviceData) ||
    (activeTab === "customers" && customerData) ||
    (activeTab === "inventory" && inventoryData);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {/* Tab bar with date range and actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="revenue" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Services
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5">
            <Package className="h-4 w-4" />
            Inventory
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          {activeTab !== "inventory" && (
            <>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
            </>
          )}
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
          {hasData && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
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
                    <p className="text-xs text-muted-foreground">Revenue</p>
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
                    <p className="text-xs text-muted-foreground">Collected</p>
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
                    <p className="text-xs text-muted-foreground">Outstanding</p>
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
                    <p className="text-xs text-muted-foreground">Services</p>
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
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueBarChart data={revenueData.monthly} formatCurrency={fmtCurrency} />
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Revenue by Type</CardTitle>
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
                  <CardTitle className="text-sm font-medium">Monthly Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Collected</TableHead>
                        <TableHead className="text-right">Count</TableHead>
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
        {!loading && !revenueData && <EmptyState />}
      </TabsContent>

      {/* Services Tab */}
      <TabsContent value="services">
        {!loading && serviceData && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="grid gap-3 grid-cols-1 max-w-xs">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Services</p>
                    <p className="text-lg font-semibold">{serviceData.totalServices}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              {serviceData.byStatus.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">By Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ServiceStatusChart data={serviceData.byStatus} />
                  </CardContent>
                </Card>
              )}
              {serviceData.byType.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">By Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ServiceTypeDonut data={serviceData.byType} />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
        {!loading && !serviceData && <EmptyState />}
      </TabsContent>

      {/* Customers Tab */}
      <TabsContent value="customers">
        {!loading && customerData && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid gap-3 grid-cols-2 max-w-lg">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total</p>
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
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-lg font-semibold">{customerData.activeCustomers}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            {customerData.topCustomers.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top Customers by Spend</CardTitle>
                </CardHeader>
                <CardContent>
                  <TopCustomersChart
                    data={customerData.topCustomers}
                    formatCurrency={fmtCurrency}
                  />
                </CardContent>
              </Card>
            )}

            {/* Table */}
            {customerData.topCustomers.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Services</TableHead>
                        <TableHead className="text-right">Total Spent</TableHead>
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
        {!loading && !customerData && <EmptyState />}
      </TabsContent>

      {/* Inventory Tab */}
      <TabsContent value="inventory">
        {!loading && inventoryData && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid gap-3 grid-cols-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                    <Package className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Parts</p>
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
                    <p className="text-xs text-muted-foreground">Items</p>
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
                    <p className="text-xs text-muted-foreground">Value</p>
                    <p className="text-lg font-semibold truncate">
                      {fmtCurrency(inventoryData.totalValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Low stock table */}
            {inventoryData.lowStock.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Part #</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Min Qty</TableHead>
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
        {!loading && !inventoryData && <EmptyState />}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No data loaded yet. Click Refresh to load the report.
        </p>
      </CardContent>
    </Card>
  );
}
