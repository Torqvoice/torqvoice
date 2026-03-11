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

type AuditLogData = {
  logs: {
    id: string;
    timestamp: Date;
    action: string;
    entity: string | null;
    entityId: string | null;
    message: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: any;
    ip: string | null;
    userAgent: string | null;
    user: { id: string; name: string | null; email: string | null };
  }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: {
    actions: string[];
    entities: string[];
    users: { id: string; name: string | null; email: string | null }[];
  };
};

function getActionColor(action: string): string {
  if (action.includes("delete") || action.includes("remove")) return "destructive";
  if (action.includes("create") || action.includes("invite") || action.includes("send")) return "default";
  if (action.includes("update") || action.includes("status") || action.includes("complete")) return "secondary";
  return "outline";
}

export function AuditLogClient({
  data,
  search,
  actionFilter,
  entityFilter,
  userFilter,
}: {
  data: AuditLogData;
  search: string;
  actionFilter: string;
  entityFilter: string;
  userFilter: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { formatDate } = useFormatDate();
  const t = useTranslations("audit");

  const getActionLabel = (action: string) => {
    try {
      return t(`actions.${action}`);
    } catch {
      return action;
    }
  };

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
      if (!("page" in params) && ("search" in params || "action" in params || "entity" in params || "userId" in params)) {
        newParams.delete("page");
      }
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const formatTimestamp = (date: Date) => {
    const d = new Date(date);
    return `${formatDate(d)} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  };

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
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={actionFilter} onValueChange={(v) => navigate({ action: v })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("allActions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allActions")}</SelectItem>
              {data.filters.actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {getActionLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={(v) => navigate({ entity: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("allEntities")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allEntities")}</SelectItem>
              {data.filters.entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={(v) => navigate({ userId: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("allUsers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allUsers")}</SelectItem>
              {data.filters.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email || u.id.substring(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">{t("timestamp")}</TableHead>
              <TableHead className="w-[140px]">{t("user")}</TableHead>
              <TableHead className="w-[200px]">{t("action")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("details")}</TableHead>
              <TableHead className="hidden lg:table-cell w-[100px]">{t("entityId")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t("noLogsFound")}
                </TableCell>
              </TableRow>
            ) : (
              data.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.user.name || log.user.email || t("unknownUser")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getActionColor(log.action) as "default" | "secondary" | "destructive" | "outline"}>
                      {getActionLabel(log.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[300px]">
                    {log.message}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                    {log.entityId?.substring(0, 8)}
                  </TableCell>
                </TableRow>
              ))
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
