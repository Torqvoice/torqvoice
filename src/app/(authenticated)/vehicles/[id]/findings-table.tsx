"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { useFormatDate } from "@/lib/use-format-date";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface FindingRow {
  id: string;
  description: string;
  severity: string;
  status: string;
  notes: string | null;
  imageUrls: string[];
  createdAt: Date;
  serviceRecord: { id: string; title: string } | null;
  resolvedServiceRecord: { id: string; title: string } | null;
}

interface FindingsTableProps {
  vehicleId: string;
  records: FindingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onAddFinding: () => void;
  onEditFinding: (finding: FindingRow) => void;
  onResolveFinding: (id: string) => void;
  onDeleteFinding: (id: string) => void;
}

const severityColors: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-500 border-red-500/20",
  needs_work: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  monitor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
  open: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  quoted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export function FindingsTable({
  vehicleId,
  records,
  total,
  page,
  pageSize,
  totalPages,
  onAddFinding,
  onEditFinding,
  onResolveFinding,
  onDeleteFinding,
}: FindingsTableProps) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("vehicles.findings");

  const createUrl = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("tab", "findings");
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      }
      if (!("findingsPage" in params) && "findingsPageSize" in params) {
        newParams.delete("findingsPage");
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

  const handlePageSizeChange = useCallback(
    (newSize: string) => {
      navigate({ findingsPageSize: newSize, findingsPage: 1 });
    },
    [navigate]
  );

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={onAddFinding}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("addFinding")}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t("table.severity")}</TableHead>
              <TableHead>{t("table.description")}</TableHead>
              <TableHead className="w-24">{t("table.status")}</TableHead>
              <TableHead className="hidden w-30 sm:table-cell">
                {t("table.date")}
              </TableHead>
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              records.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${severityColors[f.severity] || ""}`}
                    >
                      {t(`severity.${f.severity}` as "severity.urgent" | "severity.needs_work" | "severity.monitor")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{f.description}</span>
                      {f.notes && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {f.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColors[f.status] || ""}`}
                    >
                      {t(`status.${f.status}` as "status.open" | "status.quoted" | "status.resolved")}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {formatDate(new Date(f.createdAt))}
                  </TableCell>
                  <TableCell className="px-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditFinding(f)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("edit")}
                        </DropdownMenuItem>
                        {f.status !== "resolved" && (
                          <DropdownMenuItem
                            onClick={() => onResolveFinding(f.id)}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {t("resolve")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDeleteFinding(f.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t("showing", { start: startItem, end: endItem, total })}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
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
            <span>{t("perPage")}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ findingsPage: 1 })}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => navigate({ findingsPage: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              {t("page", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ findingsPage: page + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => navigate({ findingsPage: totalPages })}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
