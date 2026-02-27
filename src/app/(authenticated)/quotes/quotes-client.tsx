"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/use-format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Loader2, Plus, Search } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface QuoteRecord {
  id: string;
  quoteNumber: string | null;
  title: string;
  status: string;
  totalAmount: number;
  createdAt: Date;
  validUntil: Date | null;
  customer: { id: string; name: string } | null;
  vehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null } | null;
}

interface PaginatedData {
  records: QuoteRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

const statusTabs = [
  { key: "all", titleKey: "list.statusAll" },
  { key: "draft", titleKey: "list.statusDraft" },
  { key: "sent", titleKey: "list.statusSent" },
  { key: "accepted", titleKey: "list.statusAccepted" },
  { key: "rejected", titleKey: "list.statusRejected" },
  { key: "converted", titleKey: "list.statusConverted" },
] as const;

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  sent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  expired: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  converted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

export function QuotesClient({
  data,
  currencyCode = "USD",
  search,
  statusFilter,
}: {
  data: PaginatedData;
  currencyCode?: string;
  search: string;
  statusFilter: string;
}) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const t = useTranslations("quotes");

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      if (!("page" in params)) newParams.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate({ search: searchInput || undefined });
    },
    [navigate, searchInput]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.key;
          const count = tab.key === "all" ? undefined : data.statusCounts[tab.key] || 0;
          return (
            <Button
              key={tab.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => navigate({ status: tab.key === "all" ? undefined : tab.key })}
            >
              {t(tab.titleKey)}
              {count !== undefined && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("list.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={() => router.push("/quotes/new")}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("list.newQuote")}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-25">{t("list.columnQuoteNumber")}</TableHead>
              <TableHead>{t("list.columnTitle")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("list.columnCustomer")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("list.columnVehicle")}</TableHead>
              <TableHead className="w-27.5">{t("list.columnStatus")}</TableHead>
              <TableHead className="w-22.5">{t("list.columnDate")}</TableHead>
              <TableHead className="w-22.5 text-right">{t("list.columnTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {t("list.noQuotes")}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((q) => (
                <TableRow
                  key={q.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/quotes/${q.id}`)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {q.quoteNumber || "-"}
                  </TableCell>
                  <TableCell className="font-medium">{q.title}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {q.customer?.name || "-"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {q.vehicle ? `${q.vehicle.year} ${q.vehicle.make} ${q.vehicle.model}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColors[q.status] || ""}`}>
                      {q.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDate(new Date(q.createdAt))}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(q.totalAmount, currencyCode)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        onNavigate={navigate}
      />
    </div>
  );
}
