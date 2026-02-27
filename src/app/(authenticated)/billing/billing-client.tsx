"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/use-format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table-pagination";
import {
  Loader2,
  Search,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

interface BillingRecord {
  id: string;
  title: string;
  invoiceNumber: string | null;
  serviceDate: Date;
  totalAmount: number;
  totalPaid: number;
  status: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
    customer: {
      id: string;
      name: string;
    } | null;
  };
}

interface PaginatedBillingData {
  records: BillingRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    totalRevenue: number;
    totalPaid: number;
    outstanding: number;
    paidCount: number;
    unpaidCount: number;
    partialCount: number;
  };
}

interface BillingClientProps {
  data: PaginatedBillingData;
  currencyCode?: string;
  search: string;
  statusFilter: string;
}

const STATUS_TABS = [
  { titleKey: "history.statusAll", value: "all" },
  { titleKey: "history.statusPaid", value: "paid" },
  { titleKey: "history.statusPartial", value: "partial" },
  { titleKey: "history.statusUnpaid", value: "unpaid" },
] as const;

export default function BillingClient({
  data,
  currencyCode = "USD",
  search,
  statusFilter,
}: BillingClientProps) {
  const router = useRouter();
  const t = useTranslations("billing");
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  const createQueryString = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      }
      return newParams.toString();
    },
    [searchParams]
  );

  const handleStatusChange = (status: string) => {
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({
          status: status === "all" ? "" : status,
          page: "1",
        })}`
      );
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({
          search: searchValue,
          page: "1",
        })}`
      );
    });
  };

  const handleNavigate = (params: Record<string, string | number | undefined>) => {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        merged[key] = String(value);
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${createQueryString(merged)}`);
    });
  };

  const handleRowClick = (record: BillingRecord) => {
    router.push(
      `/vehicles/${record.vehicle.id}/service/${record.id}`
    );
  };

  const fmt = (amount: number) => formatCurrency(amount, currencyCode);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t("history.statusPaid")}</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{t("history.statusPartial")}</Badge>;
      case "unpaid":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{t("history.statusUnpaid")}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getBalanceColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return "text-emerald-600";
      case "partial":
        return "text-amber-600";
      case "unpaid":
        return "text-red-600";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled>{t("history.title")}</Button>
        <Link href="/billing/recurring">
          <Button variant="outline" size="sm">{t("history.recurring")}</Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("history.totalRevenue")}</p>
              <p className="text-lg font-bold leading-tight">
                {fmt(data.summary.totalRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("history.collected")}</p>
              <p className="text-lg font-bold leading-tight">
                {fmt(data.summary.totalPaid)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("history.outstanding")}</p>
              <p className="text-lg font-bold leading-tight">
                {fmt(data.summary.outstanding)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Tabs and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={
                statusFilter === tab.value ||
                (tab.value === "all" && !statusFilter)
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => handleStatusChange(tab.value)}
              disabled={isPending}
            >
              {t(tab.titleKey)}
              {tab.value === "paid" && (
                <span className="ml-1 text-xs">({data.summary.paidCount})</span>
              )}
              {tab.value === "partial" && (
                <span className="ml-1 text-xs">({data.summary.partialCount})</span>
              )}
              {tab.value === "unpaid" && (
                <span className="ml-1 text-xs">({data.summary.unpaidCount})</span>
              )}
            </Button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("history.searchPlaceholder")}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9 w-[250px]"
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("history.search")
            )}
          </Button>
        </form>
      </div>

      {/* Billing Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("history.columnInvoice")}</TableHead>
              <TableHead>{t("history.columnTitle")}</TableHead>
              <TableHead>{t("history.columnVehicle")}</TableHead>
              <TableHead>{t("history.columnCustomer")}</TableHead>
              <TableHead>{t("history.columnDate")}</TableHead>
              <TableHead className="text-right">{t("history.columnTotal")}</TableHead>
              <TableHead className="text-right">{t("history.columnPaid")}</TableHead>
              <TableHead className="text-right">{t("history.columnBalance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {t("history.noRecords")}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((record) => {
                const balance = record.totalAmount - record.totalPaid;
                return (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(record)}
                  >
                    <TableCell className="font-medium">
                      {record.invoiceNumber || "\u2014"}
                    </TableCell>
                    <TableCell>{record.title}</TableCell>
                    <TableCell>
                      {record.vehicle.year} {record.vehicle.make}{" "}
                      {record.vehicle.model}
                    </TableCell>
                    <TableCell>
                      {record.vehicle.customer?.name || "\u2014"}
                    </TableCell>
                    <TableCell>
                      {formatDate(new Date(record.serviceDate))}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(record.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(record.totalPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        getBalanceColor(record.status)
                      )}
                    >
                      {fmt(balance)}
                      <span className="ml-2 inline-block">
                        {getStatusBadge(record.status)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data.totalPages > 0 && (
        <DataTablePagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          onNavigate={handleNavigate}
        />
      )}

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
