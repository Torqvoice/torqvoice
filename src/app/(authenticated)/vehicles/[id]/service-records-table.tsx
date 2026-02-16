"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useFormatDate } from "@/lib/use-format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { typeColors, statusColors } from "@/lib/table-utils";
import { formatCurrency } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Paperclip,
  Plus,
  Search,
} from "lucide-react";

interface ServiceRecordRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  cost: number;
  mileage: number | null;
  serviceDate: Date;
  shopName: string | null;
  techName: string | null;
  totalAmount: number;
  invoiceNumber: string | null;
  _count: { partItems: number; laborItems: number; attachments: number };
}

interface ServiceRecordsTableProps {
  vehicleId: string;
  records: ServiceRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  type: string;
  currencyCode?: string;
}

export function ServiceRecordsTable({
  vehicleId,
  records,
  total,
  page,
  pageSize,
  totalPages,
  search,
  type,
  currencyCode = "USD",
}: ServiceRecordsTableProps) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const createUrl = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      // Always keep tab=services
      newParams.set("tab", "services");
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "" || value === "all") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      // Reset to page 1 when filters change (unless explicitly setting page)
      if (!("page" in params) && ("search" in params || "type" in params)) {
        newParams.delete("page");
      }
      return `${pathname}?${newParams.toString()}`;
    },
    [pathname, searchParams]
  );

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      startTransition(() => {
        router.push(createUrl(params));
      });
    },
    [router, createUrl]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate({ search: searchInput || undefined });
    },
    [navigate, searchInput]
  );

  const handlePageSizeChange = useCallback(
    (newSize: string) => {
      navigate({ pageSize: newSize, page: 1 });
    },
    [navigate]
  );

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filters + Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          <Select
            value={type || "all"}
            onValueChange={(v) => navigate({ type: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="upgrade">Upgrade</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
            </SelectContent>
          </Select>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" asChild>
          <Link href={`/vehicles/${vehicleId}/service/new`}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New Work Order
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Mileage</TableHead>
              <TableHead className="hidden w-[120px] sm:table-cell">Technician</TableHead>
              <TableHead className="w-[50px] text-center">Files</TableHead>
              <TableHead className="w-[100px] text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {search || type !== "all"
                    ? "No service records match your filters."
                    : "No service records yet."}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => {
                const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost;
                return (
                  <TableRow
                    key={record.id}
                    className={`cursor-pointer transition-opacity ${navigatingId === record.id ? "opacity-50" : ""}`}
                    onClick={() => {
                      setNavigatingId(record.id);
                      router.push(`/vehicles/${vehicleId}/service/${record.id}`);
                    }}
                  >
                    <TableCell className="font-mono text-xs">
                      {formatDate(new Date(record.serviceDate))}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate">
                        <span className="font-medium">{record.title}</span>
                        {record.invoiceNumber && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {record.invoiceNumber}
                          </span>
                        )}
                      </div>
                      {record.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {record.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${typeColors[record.type] || ""}`}>
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[record.status] || ""}`}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {record.mileage ? record.mileage.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {record.techName || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {record._count.attachments > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {record._count.attachments}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <span className="inline-flex items-center gap-2">
                        {navigatingId === record.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                        {formatCurrency(displayTotal, currencyCode)}
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
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {startItem}-{endItem} of {total}
            </span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <span>per page</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ page: 1 })}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ page: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ page: page + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ page: totalPages })}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
