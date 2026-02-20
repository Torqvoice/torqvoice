"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFormatDate } from "@/lib/use-format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Loader2, Plus, Search } from "lucide-react";
import { NewInspectionDialog } from "@/features/inspections/Components/NewInspectionDialog";

interface InspectionRecord {
  id: string;
  status: string;
  mileage: number | null;
  createdAt: Date;
  completedAt: Date | null;
  vehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null };
  template: { id: string; name: string };
  items: { id: string; condition: string }[];
}

interface PaginatedData {
  records: InspectionRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

interface TemplateOption {
  id: string;
  name: string;
  isDefault: boolean;
}

const statusTabs = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

const statusColors: Record<string, string> = {
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const conditionColors: Record<string, string> = {
  pass: "bg-emerald-500",
  fail: "bg-red-500",
  attention: "bg-amber-500",
  not_inspected: "bg-gray-300 dark:bg-gray-600",
};

function InspectionProgress({ items }: { items: { condition: string }[] }) {
  if (items.length === 0) return null;
  const counts = { pass: 0, fail: 0, attention: 0, not_inspected: 0 };
  for (const item of items) {
    const c = item.condition as keyof typeof counts;
    if (c in counts) counts[c]++;
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-2 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        {(["pass", "fail", "attention", "not_inspected"] as const).map((c) => {
          const pct = (counts[c] / items.length) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={c}
              className={conditionColors[c]}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {items.length - counts.not_inspected}/{items.length}
      </span>
    </div>
  );
}

export function InspectionsClient({
  data,
  templates,
  search,
  statusFilter,
}: {
  data: PaginatedData;
  templates: TemplateOption[];
  search: string;
  statusFilter: string;
}) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
  const [showNewDialog, setShowNewDialog] = useState(false);

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
              {tab.label}
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
              placeholder="Search inspections..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Inspection
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead className="hidden md:table-cell">Template</TableHead>
              <TableHead className="w-32">Progress</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No inspections found.
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((insp) => (
                <TableRow
                  key={insp.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/inspections/${insp.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                      </p>
                      {insp.vehicle.licensePlate && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {insp.vehicle.licensePlate}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {insp.template.name}
                  </TableCell>
                  <TableCell>
                    <InspectionProgress items={insp.items} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColors[insp.status] || ""}`}>
                      {insp.status === "in_progress" ? "In Progress" : "Completed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDate(new Date(insp.createdAt))}
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

      <NewInspectionDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        templates={templates}
      />
    </div>
  );
}
