"use client";


import { useTableKeyboardNav } from "@/hooks/use-table-keyboard-nav";
import { interactiveRow } from '@/lib/interactive-row';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useCallback, useTransition } from "react";
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
import { TableCellLink } from "@/components/table-cell-link";
import {
  Loader2,
  Search,
  DollarSign,
  TrendingUp,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from '@/components/currency-settings-context'

interface BillingRecord {
  id: string;
  title: string;
  invoiceNumber: string | null;
  serviceDate: Date;
  startDateTime: Date | null;
  totalAmount: number;
  totalPaid: number;
  status: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  } | null;
  customer: {
    id: string;
    name: string;
  } | null;
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
  sortBy?: string;
  sortOrder?: "asc" | "desc";
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
  sortBy = "",
  sortOrder = "desc",
}: BillingClientProps) {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const t = useTranslations("billing");
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const tableNav = useTableKeyboardNav();

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

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === "asc" ? "desc" : "asc";
      startTransition(() => {
        router.push(
          `${pathname}?${createQueryString({ sortBy: column, sortOrder: newOrder, page: "1" })}`
        );
      });
    },
    [createQueryString, pathname, router, sortBy, sortOrder]
  );

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortOrder === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

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

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchValue,
    setValue: setSearchValue,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => {
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({
          search: term ?? "",
          page: "1",
        })}`
      );
    });
  });

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
      record.vehicle
        ? `/vehicles/${record.vehicle.id}/service/${record.id}`
        : `/sales/${record.id}`
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

      {/* Summary Cards — hidden below md so the invoice list is what a phone
          or portrait tablet opens on. */}
      <div className="hidden gap-3 md:grid md:grid-cols-3">
        <Card>
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

        <Card>
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

        <Card>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* A single scrollable row on phones, so four filters never wrap. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
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
              className="h-9 shrink-0 sm:h-8"
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
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("history.searchPlaceholder")}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-full pl-9 sm:w-[250px]"
              {...tableNav.searchInputProps}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            aria-label={t("history.search")}
            title={t("history.search")}
            className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 md:hidden" />
                <span className="hidden md:inline">{t("history.search")}</span>
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {data.records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("history.noRecords")}
          </div>
        ) : (
          data.records.map((record) => {
            const balance = record.totalAmount - record.totalPaid;
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => handleRowClick(record)}
                className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{record.title}</span>
                  <span className="shrink-0 font-semibold">{fmt(record.totalAmount)}</span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {record.vehicle && (
                    <p className="truncate">
                      {record.vehicle.year} {record.vehicle.make} {record.vehicle.model}
                      {record.vehicle.licensePlate && ` · ${record.vehicle.licensePlate}`}
                    </p>
                  )}
                  {record.customer && <p className="truncate">{record.customer.name}</p>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {getStatusBadge(record.status)}
                  <span className={cn("font-medium", getBalanceColor(record.status))}>
                    {t("history.columnBalance")}: {fmt(balance)}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {formatDate(new Date(record.serviceDate))}
                  </span>
                  {record.invoiceNumber && (
                    <span className="font-mono text-muted-foreground">
                      {record.invoiceNumber}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden rounded-md border md:block" {...tableNav.containerProps}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort("invoiceNumber")}>
                  {t("history.columnInvoice")}<SortIcon column="invoiceNumber" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort("title")}>
                  {t("history.columnTitle")}<SortIcon column="title" />
                </button>
              </TableHead>
              <TableHead className="w-[16%]">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort("vehicle")}>
                  {t("history.columnVehicle")}<SortIcon column="vehicle" />
                </button>
              </TableHead>
              <TableHead className="w-[14%]">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort("customer")}>
                  {t("history.columnCustomer")}<SortIcon column="customer" />
                </button>
              </TableHead>
              <TableHead className="w-[110px]">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort("date")}>
                  {t("history.columnDate")}<SortIcon column="date" />
                </button>
              </TableHead>
              <TableHead className="w-[100px]">
                <button type="button" className="ml-auto flex items-center hover:text-foreground" onClick={() => handleSort("total")}>
                  {t("history.columnTotal")}<SortIcon column="total" />
                </button>
              </TableHead>
              <TableHead className="w-[100px] text-right">{t("history.columnPaid")}</TableHead>
              <TableHead className="w-[180px] text-right">{t("history.columnBalance")}</TableHead>
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
                    {...interactiveRow(() => handleRowClick(record))}
                  >
                    <TableCell className="truncate font-medium">
                      {record.invoiceNumber || "\u2014"}
                    </TableCell>
                    <TableCell className="truncate">{record.title}</TableCell>
                    <TableCell className="truncate">
                      {record.vehicle ? (
                        <TableCellLink href={`/vehicles/${record.vehicle.id}`}>
                          {record.vehicle.year} {record.vehicle.make} {record.vehicle.model}
                        </TableCellLink>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell className="truncate">
                      {record.customer ? (
                        <TableCellLink href={`/customers/${record.customer.id}`}>
                          {record.customer.name}
                        </TableCellLink>
                      ) : (
                        "\u2014"
                      )}
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
                        "whitespace-nowrap text-right font-medium",
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
