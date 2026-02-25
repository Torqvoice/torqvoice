"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/use-format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { statusColors } from "@/lib/table-utils";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  FileText,
  Gauge,
  Loader2,
  BellRing,
  MessageSquare,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { dismissMaintenance } from "@/features/vehicles/Actions/dismissMaintenance";
import { updateQuoteRequestStatus } from "@/features/inspections/Actions/quoteRequestActions";
import { acknowledgeQuoteResponse } from "@/features/quotes/Actions/quoteResponseActions";
import { convertQuoteToServiceRecord } from "@/features/quotes/Actions/quoteActions";
import { useDashboardVisibility, DASHBOARD_CARD_IDS } from "@/hooks/use-dashboard-visibility";

interface ServiceItem {
  id: string;
  title: string;
  status: string;
  techName: string | null;
  totalAmount: number;
  cost: number;
  serviceDate: Date;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
    customer: { id: string; name: string } | null;
  };
}

interface DashboardStats {
  isAdmin: boolean;
  activeJobs: number;
  pendingJobs: number;
  todayRevenue: number;
  totalCustomers: number;
  todaysServices: ServiceItem[];
  recentServices: ServiceItem[];
}

interface ReminderItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueMileage: number | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
}

interface VehicleDueForService {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  predictedMileage: number;
  lastServiceMileage: number;
  mileageSinceLastService: number;
  serviceInterval: number;
  status: "overdue" | "approaching";
  confidencePercent: number;
}

interface DashboardInspection {
  id: string;
  status: string;
  createdAt: Date;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
  template: { id: string; name: string };
  items: { id: string; condition: string }[];
}

interface DashboardQuoteRequest {
  id: string;
  status: string;
  message: string | null;
  selectedItemIds: string[];
  createdAt: Date;
  inspection: {
    id: string;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
      customer: { name: string } | null;
    };
    items: { id: string; name: string; section: string; condition: string; notes: string | null }[];
  };
}

interface DashboardQuoteResponse {
  id: string;
  title: string;
  quoteNumber: string | null;
  status: string;
  customerMessage: string | null;
  totalAmount: number;
  updatedAt: Date;
  vehicleId: string | null;
  customer: { name: string } | null;
  vehicle: { id: string; make: string; model: string; year: number } | null;
}

interface SmsThread {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  lastMessage: {
    id: string;
    body: string;
    direction: string;
    status: string;
    createdAt: string | Date;
  };
}

interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityUrl: string;
  read: boolean;
  createdAt: string | Date;
}

export function DashboardClient({
  stats,
  currencyCode = "USD",
  upcomingReminders = [],
  vehiclesDueForService = [],
  unitSystem = "imperial",
  inProgressInspections = [],
  completedInspections = [],
  quoteRequests = [],
  quoteResponses = [],
  smsThreads = [],
  smsEnabled = false,
  notifications = [],
}: {
  stats: DashboardStats;
  currencyCode?: string;
  upcomingReminders?: ReminderItem[];
  vehiclesDueForService?: VehicleDueForService[];
  unitSystem?: "metric" | "imperial";
  inProgressInspections?: DashboardInspection[];
  completedInspections?: DashboardInspection[];
  quoteRequests?: DashboardQuoteRequest[];
  quoteResponses?: DashboardQuoteResponse[];
  smsThreads?: SmsThread[];
  smsEnabled?: boolean;
  notifications?: DashboardNotification[];
}) {
  const t = useTranslations("dashboard");
  const distUnit = unitSystem === "metric" ? "km" : "mi";
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toggleCard, isVisible } = useDashboardVisibility();

  const formatRelativeTime = (date: string | Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("relativeTime.now");
    if (diffMins < 60) return t("relativeTime.minutes", { count: diffMins });
    if (diffHours < 24) return t("relativeTime.hours", { count: diffHours });
    if (diffDays < 7) return t("relativeTime.days", { count: diffDays });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const handleDismiss = (vehicleId: string) => {
    setDismissingId(vehicleId);
    startTransition(async () => {
      await dismissMaintenance(vehicleId);
      setDismissingId(null);
    });
  };

  return (
    <div className="space-y-4">
      {/* Quick stats row */}
      <div className={`grid grid-cols-2 gap-3 ${stats.isAdmin ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              <span className="text-xs font-medium">{t("stats.activeJobs")}</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.activeJobs}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">{t("stats.pending")}</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.pendingJobs}</p>
          </CardContent>
        </Card>
        {stats.isAdmin && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">{t("stats.todaysRevenue")}</span>
              </div>
              <p className="mt-1 text-2xl font-bold">
                {formatCurrency(stats.todayRevenue, currencyCode)}
              </p>
            </CardContent>
          </Card>
        )}
        {stats.isAdmin && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">{t("stats.totalCustomers")}</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{stats.totalCustomers}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Customize Dashboard */}
      <div className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("customize")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <p className="text-sm font-medium mb-2">{t("showCards")}</p>
            <div className="space-y-2">
              {DASHBOARD_CARD_IDS.filter((id) => smsEnabled ? id !== "notifications" : id !== "sms").map((id) => (
                <label key={id} className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm">{t(`cards.${id}`)}</span>
                  <Switch
                    size="sm"
                    checked={isVisible(id)}
                    onCheckedChange={() => toggleCard(id)}
                  />
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vehicles Due for Service */}
        {isVisible("maintenance") && vehiclesDueForService.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                {t("maintenance.title")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("maintenance.description")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {vehiclesDueForService.map((v) => (
                  <div
                    key={v.vehicleId}
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/vehicles/${v.vehicleId}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        v.status === "overdue" ? "bg-red-500/10" : "bg-amber-500/10"
                      }`}>
                        {v.status === "overdue" ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {v.year} {v.make} {v.model}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {v.licensePlate && `${v.licensePlate} · `}
                          {t("maintenance.estimated", { mileage: v.predictedMileage.toLocaleString(), unit: distUnit })}
                          {" · "}
                          {t("maintenance.sinceLastService", { mileage: v.mileageSinceLastService.toLocaleString(), unit: distUnit })}
                          {" · "}
                          {t("maintenance.certainty", { percent: v.confidencePercent })}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3 flex items-center gap-1.5">
                      {v.status === "overdue" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {t("maintenance.overdue")}
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                          {t("maintenance.approaching")}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        disabled={dismissingId === v.vehicleId}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(v.vehicleId);
                        }}
                      >
                        {dismissingId === v.vehicleId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Reminders */}
        {isVisible("reminders") && upcomingReminders.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                {t("reminders.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {upcomingReminders.map((r) => {
                  const now = new Date();
                  const sevenDaysFromNow = new Date(now);
                  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
                  const isOverdue = r.dueDate && new Date(r.dueDate) < now;
                  const isDueSoon = r.dueDate && !isOverdue && new Date(r.dueDate) <= sevenDaysFromNow;

                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/vehicles/${r.vehicle.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isOverdue ? "bg-red-500/10" : isDueSoon ? "bg-amber-500/10" : "bg-primary/10"
                        }`}>
                          {isOverdue ? (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          ) : isDueSoon ? (
                            <Clock className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Bell className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                            {r.vehicle.licensePlate && ` · ${r.vehicle.licensePlate}`}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px]">
                            {t("reminders.overdue")}
                          </Badge>
                        )}
                        {isDueSoon && (
                          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                            {t("reminders.dueSoon")}
                          </Badge>
                        )}
                        {r.dueDate && !isOverdue && !isDueSoon && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(new Date(r.dueDate))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* SMS Messages */}
        {isVisible("sms") && smsEnabled && smsThreads.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  {t("messages.title")}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => router.push("/messages")}
                >
                  {t("messages.viewAll")}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {smsThreads.map((thread) => (
                  <div
                    key={thread.customerId}
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/messages?customerId=${thread.customerId}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{thread.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {thread.lastMessage.direction === "outbound" ? t("messages.you") : ""}
                          {thread.lastMessage.body}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 ml-3 text-xs text-muted-foreground">
                      {formatRelativeTime(thread.lastMessage.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Notifications (shown when SMS is not configured) */}
        {isVisible("notifications") && !smsEnabled && notifications.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BellRing className="h-4 w-4" />
                  {t("notifications.title")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {notifications.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(n.entityUrl)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-muted" : "bg-primary/10"}`}>
                        <BellRing className={`h-4 w-4 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                      </div>
                    </div>
                    <span className="shrink-0 ml-3 text-xs text-muted-foreground">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inspections */}
        {isVisible("inspections") && (inProgressInspections.length > 0 || completedInspections.length > 0) && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4" />
                {t("inspections.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {inProgressInspections.map((insp) => {
                  const total = insp.items.length;
                  const pass = insp.items.filter((i) => i.condition === "pass").length;
                  const fail = insp.items.filter((i) => i.condition === "fail").length;
                  const attention = insp.items.filter((i) => i.condition === "attention").length;
                  const inspected = pass + fail + attention;

                  return (
                    <div
                      key={insp.id}
                      className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/inspections/${insp.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                          <ClipboardCheck className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {insp.vehicle.licensePlate && `${insp.vehicle.licensePlate} · `}
                            {insp.template.name} · {t("inspections.itemCount", { inspected, total })}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        {total > 0 && (
                          <div className="hidden sm:flex h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                            <div className="bg-emerald-500" style={{ width: `${(pass / total) * 100}%` }} />
                            <div className="bg-red-500" style={{ width: `${(fail / total) * 100}%` }} />
                            <div className="bg-amber-500" style={{ width: `${(attention / total) * 100}%` }} />
                          </div>
                        )}
                        <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20 text-[10px]">
                          {t("inspections.inProgress")}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {completedInspections.map((insp) => {
                  const total = insp.items.length;
                  const pass = insp.items.filter((i) => i.condition === "pass").length;
                  const fail = insp.items.filter((i) => i.condition === "fail").length;
                  const attention = insp.items.filter((i) => i.condition === "attention").length;

                  return (
                    <div
                      key={insp.id}
                      className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/inspections/${insp.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                          <Check className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {insp.vehicle.licensePlate && `${insp.vehicle.licensePlate} · `}
                            {insp.template.name} · {formatDate(new Date(insp.createdAt))}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        {total > 0 && (
                          <div className="hidden sm:flex h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                            <div className="bg-emerald-500" style={{ width: `${(pass / total) * 100}%` }} />
                            <div className="bg-red-500" style={{ width: `${(fail / total) * 100}%` }} />
                            <div className="bg-amber-500" style={{ width: `${(attention / total) * 100}%` }} />
                          </div>
                        )}
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[10px]">
                          {t("inspections.completed")}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quote Requests */}
        {isVisible("quoteRequests") && quoteRequests.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                {t("quoteRequests.title")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("quoteRequests.description")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {quoteRequests.map((req) => {
                  const selectedItems = req.inspection.items.filter((i) =>
                    req.selectedItemIds.includes(i.id)
                  );
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between px-5 py-3"
                    >
                      <div
                        className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                        onClick={() => router.push(`/inspections/${req.inspection.id}`)}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {req.inspection.vehicle.year} {req.inspection.vehicle.make} {req.inspection.vehicle.model}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {req.inspection.vehicle.customer?.name && `${req.inspection.vehicle.customer.name} · `}
                            {t("quoteRequests.itemsRequested", { count: selectedItems.length })}
                            {req.message && ` · "${req.message}"`}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-1.5">
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                          {t("quoteRequests.pending")}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            startTransition(async () => {
                              await updateQuoteRequestStatus(req.id, "quoted");
                            });
                            router.push(`/quotes/new?fromInspection=${req.inspection.id}`);
                          }}
                        >
                          {t("quoteRequests.createQuote")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            startTransition(async () => {
                              await updateQuoteRequestStatus(req.id, "dismissed");
                            });
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customer Quote Responses */}
        {isVisible("quoteResponses") && quoteResponses.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                {t("quoteResponses.title")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("quoteResponses.description")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {quoteResponses.map((resp) => (
                  <div
                    key={resp.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                      onClick={() => router.push(`/quotes/${resp.id}`)}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        resp.status === "accepted" ? "bg-emerald-500/10" : "bg-orange-500/10"
                      }`}>
                        {resp.status === "accepted" ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-orange-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {resp.title}
                          {resp.quoteNumber && <span className="ml-1.5 text-muted-foreground font-normal">({resp.quoteNumber})</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {resp.customer?.name && `${resp.customer.name} · `}
                          {resp.status === "accepted" ? t("quoteResponses.accepted") : t("quoteResponses.changesRequested")}
                          {resp.customerMessage && ` · "${resp.customerMessage}"`}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3 flex items-center gap-1.5">
                      {resp.status === "accepted" ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          {t("quoteResponses.accepted")}
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">
                          {t("quoteResponses.changesRequested")}
                        </Badge>
                      )}
                      {resp.status === "accepted" && resp.vehicleId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            startTransition(async () => {
                              const result = await convertQuoteToServiceRecord(resp.id, resp.vehicleId!);
                              if (result.success && result.data) {
                                router.push(`/vehicles/${resp.vehicleId}/service/${result.data.id}`);
                              }
                            });
                          }}
                        >
                          <ArrowRight className="mr-1 h-3 w-3" />
                          {t("quoteResponses.convertToWorkOrder")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => router.push(`/quotes/${resp.id}`)}
                      >
                        {t("quoteResponses.viewQuote")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          startTransition(async () => {
                            await acknowledgeQuoteResponse(resp.id);
                          });
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Completed table */}
        {isVisible("recentCompleted") && (
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("recentCompleted.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-22.5">{t("recentCompleted.date")}</TableHead>
                    <TableHead>{t("recentCompleted.vehicle")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("recentCompleted.customer")}</TableHead>
                    <TableHead>{t("recentCompleted.serviceTitle")}</TableHead>
                    {stats.isAdmin && <TableHead className="w-22.5 text-right">{t("recentCompleted.total")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentServices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={stats.isAdmin ? 5 : 4} className="h-20 text-center text-muted-foreground">
                        {t("recentCompleted.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.recentServices.map((s) => {
                      const displayTotal = s.totalAmount > 0 ? s.totalAmount : s.cost;
                      return (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer transition-opacity ${navigatingId === s.id ? "opacity-50" : ""}`}
                          onClick={() => {
                            setNavigatingId(s.id);
                            router.push(`/vehicles/${s.vehicle.id}/service/${s.id}`);
                          }}
                        >
                          <TableCell className="font-mono text-xs">
                            {formatDate(new Date(s.serviceDate))}
                          </TableCell>
                          <TableCell>
                            <div>
                              {s.vehicle.licensePlate && (
                                <span className="font-mono text-sm">{s.vehicle.licensePlate}</span>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {s.vehicle.customer?.name || "-"}
                          </TableCell>
                          <TableCell className="font-medium">{s.title}</TableCell>
                          {stats.isAdmin && (
                            <TableCell className="text-right font-semibold">
                              <span className="inline-flex items-center gap-2">
                                {navigatingId === s.id && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                )}
                                {formatCurrency(displayTotal, currencyCode)}
                              </span>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Active Jobs table */}
        {isVisible("activeJobs") && (
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("activeJobsTable.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("activeJobsTable.vehicle")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("activeJobsTable.customer")}</TableHead>
                    <TableHead>{t("activeJobsTable.serviceTitle")}</TableHead>
                    <TableHead className="w-27.5">{t("activeJobsTable.status")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("activeJobsTable.tech")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.todaysServices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        {t("activeJobsTable.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.todaysServices.map((s) => (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer transition-opacity ${navigatingId === s.id ? "opacity-50" : ""}`}
                        onClick={() => {
                          setNavigatingId(s.id);
                          router.push(`/vehicles/${s.vehicle.id}/service/${s.id}`);
                        }}
                      >
                        <TableCell>
                          <div>
                            {s.vehicle.licensePlate && (
                              <span className="font-mono text-sm font-medium">{s.vehicle.licensePlate}</span>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {s.vehicle.customer?.name || "-"}
                        </TableCell>
                        <TableCell className="font-medium">{s.title}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            {navigatingId === s.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Badge variant="outline" className={`text-xs ${statusColors[s.status] || ""}`}>
                              {s.status}
                            </Badge>
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {s.techName || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
