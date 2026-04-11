"use client";

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { DataTablePagination } from "@/components/data-table-pagination";
import { useFormatDate } from "@/lib/use-format-date";
import { Search, Loader2 } from "lucide-react";

type ObservationsData = {
  records: {
    id: string;
    description: string;
    severity: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
    serviceRecord: { id: string; title: string } | null;
    resolvedServiceRecord: { id: string; title: string } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const severityColors: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-500 border-red-500/20",
  needs_work: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  monitor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  resolved: "bg-green-500/10 text-green-600 border-green-500/20",
};

export function ObservationsClient({
  data,
  search,
  statusFilter,
  severityFilter,
}: {
  data: ObservationsData;
  search: string;
  statusFilter: string;
  severityFilter: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { formatDate } = useFormatDate();
  const t = useTranslations("vehicles.observationsPage");
  const tf = useTranslations("vehicles.findings");

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "" || value === "all") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      if (!("page" in params) && ("search" in params || "status" in params || "severity" in params)) {
        newParams.delete("page");
      }
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            defaultValue={search}
            onChange={(e) => {
              const value = e.target.value;
              if (value === search) return;
              navigate({ search: value || undefined });
            }}
            className="pl-9 pr-9"
          />
          {isPending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => navigate({ status: v })}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="open">{tf("status.open")}</SelectItem>
              <SelectItem value="resolved">{tf("status.resolved")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={(v) => navigate({ severity: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allSeverities")}</SelectItem>
              <SelectItem value="urgent">{tf("severity.urgent")}</SelectItem>
              <SelectItem value="needs_work">{tf("severity.needs_work")}</SelectItem>
              <SelectItem value="monitor">{tf("severity.monitor")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">{t("columns.severity")}</TableHead>
              <TableHead className="w-[100px]">{t("columns.status")}</TableHead>
              <TableHead className="w-[160px]">{t("columns.vehicle")}</TableHead>
              <TableHead>{t("columns.description")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.notes")}</TableHead>
              <TableHead className="w-[110px] text-right">{t("columns.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((obs) => {
                const vehicleLabel = obs.vehicle.licensePlate
                  ?? `${obs.vehicle.year} ${obs.vehicle.make} ${obs.vehicle.model}`;
                return (
                  <TableRow
                    key={obs.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)}
                  >
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${severityColors[obs.severity] || ""}`}>
                        {tf(`severity.${obs.severity}` as "severity.urgent" | "severity.needs_work" | "severity.monitor")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[obs.status] || ""}`}>
                        {tf(`status.${obs.status}` as "status.open" | "status.quoted" | "status.resolved")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-medium">{vehicleLabel}</span>
                        {obs.vehicle.licensePlate && (
                          <span className="text-[11px] text-muted-foreground">
                            {obs.vehicle.year} {obs.vehicle.make} {obs.vehicle.model}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{obs.description}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[300px]">
                      {obs.notes}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(new Date(obs.createdAt))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
