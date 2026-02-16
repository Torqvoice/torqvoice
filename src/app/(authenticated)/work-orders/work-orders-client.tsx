"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useFormatDate } from "@/lib/use-format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DataTablePagination } from "@/components/data-table-pagination";
import { statusColors } from "@/lib/table-utils";
import { updateServiceStatus } from "@/features/vehicles/Actions/serviceActions";
import {
  ChevronDown,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { VehiclePickerDialog } from "@/components/vehicle-picker-dialog";

interface WorkOrder {
  id: string;
  title: string;
  type: string;
  status: string;
  totalAmount: number;
  cost: number;
  serviceDate: Date;
  techName: string | null;
  invoiceNumber: string | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
    customer: { id: string; name: string } | null;
  };
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customer: { id: string; name: string; company: string | null } | null;
}

interface CustomerOption {
  id: string;
  name: string;
  company: string | null;
}

interface PaginatedData {
  records: WorkOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

const statusTabs = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "in-progress", label: "In Progress" },
  { key: "waiting-parts", label: "Waiting Parts" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
];

const statusTransitions: Record<string, { label: string; target: string }[]> = {
  pending: [
    { label: "Start Work", target: "in-progress" },
  ],
  "in-progress": [
    { label: "Waiting Parts", target: "waiting-parts" },
    { label: "Mark Ready", target: "ready" },
    { label: "Complete", target: "completed" },
  ],
  "waiting-parts": [
    { label: "Resume Work", target: "in-progress" },
    { label: "Mark Ready", target: "ready" },
  ],
  ready: [
    { label: "Complete", target: "completed" },
  ],
  completed: [
    { label: "Reopen", target: "pending" },
  ],
};

export function WorkOrdersClient({
  data,
  vehicles = [],
  customers = [],
  currencyCode = "USD",
  search,
  statusFilter,
}: {
  data: PaginatedData;
  vehicles?: VehicleOption[];
  customers?: CustomerOption[];
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
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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
      if (!("page" in params)) {
        newParams.delete("page");
      }
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

  const handleStatusChange = async (recordId: string, newStatus: string) => {
    await updateServiceStatus(recordId, newStatus);
    toast.success("Status updated");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.key;
          const count = tab.key === "all" || tab.key === "active"
            ? undefined
            : data.statusCounts[tab.key] || 0;
          return (
            <Button
              key={tab.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => navigate({ status: tab.key || undefined })}
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

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search work orders..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={() => setShowPicker(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Work Order
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell w-[100px]">Invoice#</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Tech</TableHead>
              <TableHead className="w-[90px]">Date</TableHead>
              <TableHead className="w-[90px] text-right">Total</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No work orders found.
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((r) => {
                const displayTotal = r.totalAmount > 0 ? r.totalAmount : r.cost;
                const transitions = statusTransitions[r.status] || [];
                return (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer transition-opacity ${navigatingId === r.id ? "opacity-50" : ""}`}
                    onClick={() => {
                      setNavigatingId(r.id);
                      router.push(`/vehicles/${r.vehicle.id}/service/${r.id}`);
                    }}
                  >
                    <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {r.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell>
                      <div>
                        {r.vehicle.licensePlate && (
                          <span className="font-mono text-sm font-medium">{r.vehicle.licensePlate}</span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {r.vehicle.customer?.name || "-"}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{r.title}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[r.status] || ""}`}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {r.techName || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatDate(new Date(r.serviceDate))}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(displayTotal, currencyCode)}
                    </TableCell>
                    <TableCell>
                      {navigatingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : transitions.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {transitions.map((t) => (
                              <DropdownMenuItem
                                key={t.target}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(r.id, t.target);
                                }}
                              >
                                {t.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
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

      <VehiclePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        vehicles={vehicles}
        customers={customers}
        title="Select Vehicle"
      />
    </div>
  );
}
