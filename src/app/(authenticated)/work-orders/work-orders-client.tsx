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
import { NotifyCustomerDialog } from "@/components/notify-customer-dialog";
import { useTranslations } from "next-intl";
import { getSmsTemplates } from "@/features/sms/Actions/smsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from "@/lib/sms-templates";

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
    customer: { id: string; name: string; email: string | null; phone: string | null } | null;
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

const statusTabKeys = ["all", "active", "pending", "in-progress", "waiting-parts", "completed"] as const;

const statusTabI18nMap: Record<string, string> = {
  "all": "all",
  "active": "active",
  "pending": "pending",
  "in-progress": "inProgress",
  "waiting-parts": "waitingParts",
  "completed": "completed",
};

const statusTemplateKeys: Record<string, string> = {
  "in-progress": SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
  "waiting-parts": SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
  "completed": SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
};

const statusActionI18nMap: Record<string, string> = {
  "startWork": "startWork",
  "waitingParts": "waitingParts",
  "complete": "complete",
  "resumeWork": "resumeWork",
  "reopen": "reopen",
};

const statusTransitions: Record<string, { actionKey: string; target: string }[]> = {
  pending: [
    { actionKey: "startWork", target: "in-progress" },
  ],
  "in-progress": [
    { actionKey: "waitingParts", target: "waiting-parts" },
    { actionKey: "complete", target: "completed" },
  ],
  "waiting-parts": [
    { actionKey: "resumeWork", target: "in-progress" },
    { actionKey: "complete", target: "completed" },
  ],
  completed: [
    { actionKey: "reopen", target: "pending" },
  ],
};

export function WorkOrdersClient({
  data,
  vehicles = [],
  customers = [],
  currencyCode = "USD",
  search,
  statusFilter,
  smsEnabled = false,
  emailEnabled = false,
}: {
  data: PaginatedData;
  vehicles?: VehicleOption[];
  customers?: CustomerOption[];
  currencyCode?: string;
  search: string;
  statusFilter: string;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
}) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("workOrders.list");
  const [searchInput, setSearchInput] = useState(search);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState<{ id: string; name: string; email: string | null; phone: string | null } | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyStatus, setNotifyStatus] = useState("");

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

  const handleStatusChange = async (workOrder: WorkOrder, newStatus: string) => {
    await updateServiceStatus(workOrder.id, newStatus);
    toast.success(t("statusUpdated"));
    router.refresh();

    const templateKey = statusTemplateKeys[newStatus];
    if (workOrder.vehicle.customer && templateKey) {
      const tplResult = await getSmsTemplates();
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null;
      const tpl = tplData?.templates[templateKey] || SMS_TEMPLATE_DEFAULTS[templateKey] || "";
      const vehicle = `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`;
      const message = interpolateSmsTemplate(tpl, {
        customer_name: workOrder.vehicle.customer.name,
        vehicle,
        company_name: tplData?.companyName || "",
        current_user: tplData?.currentUser || "",
      });
      setNotifyCustomer(workOrder.vehicle.customer);
      setNotifyMessage(message);
      setNotifyStatus(newStatus);
      setShowNotifyDialog(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabKeys.map((key) => {
          const isActive = statusFilter === key;
          const count = key === "all" || key === "active"
            ? undefined
            : data.statusCounts[key] || 0;
          return (
            <Button
              key={key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => navigate({ status: key || undefined })}
            >
              {t(`statusTabs.${statusTabI18nMap[key]}`)}
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
              placeholder={t("searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={() => setShowPicker(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("newWorkOrder")}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell w-[100px]">{t("table.invoice")}</TableHead>
              <TableHead>{t("table.vehicle")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.customer")}</TableHead>
              <TableHead>{t("table.title")}</TableHead>
              <TableHead className="w-[110px]">{t("table.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.tech")}</TableHead>
              <TableHead className="w-[90px]">{t("table.date")}</TableHead>
              <TableHead className="w-[90px] text-right">{t("table.total")}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {t("empty")}
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
                            {transitions.map((tr) => (
                              <DropdownMenuItem
                                key={tr.target}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(r, tr.target);
                                }}
                              >
                                {t(`statusActions.${tr.actionKey}`)}
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
        title={t("selectVehicle")}
      />

      {notifyCustomer && (
        <NotifyCustomerDialog
          open={showNotifyDialog}
          onOpenChange={setShowNotifyDialog}
          customer={notifyCustomer}
          defaultMessage={notifyMessage}
          emailSubject={t("emailSubject", { status: notifyStatus })}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
          relatedEntityType="work-order"
        />
      )}
    </div>
  );
}
