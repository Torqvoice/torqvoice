"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { useDashboardVisibility, DASHBOARD_CARDS } from "@/hooks/use-dashboard-visibility";

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
}) {
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

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
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
              <span className="text-xs font-medium">Active Jobs</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.activeJobs}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Pending</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.pendingJobs}</p>
          </CardContent>
        </Card>
        {stats.isAdmin && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">Today&apos;s Revenue</span>
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
                <span className="text-xs font-medium">Total Customers</span>
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
              Customize
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <p className="text-sm font-medium mb-2">Show cards</p>
            <div className="space-y-2">
              {DASHBOARD_CARDS.filter((c) => c.id !== "sms" || smsEnabled).map((card) => (
                <label key={card.id} className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm">{card.label}</span>
                  <Switch
                    size="sm"
                    checked={isVisible(card.id)}
                    onCheckedChange={() => toggleCard(card.id)}
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
                Predicted Maintenance Due
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Based on service history and estimated daily mileage
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
                          Est. {v.predictedMileage.toLocaleString()} {distUnit}
                          {" · "}
                          {v.mileageSinceLastService.toLocaleString()} {distUnit} since last service
                          {" · "}
                          {v.confidencePercent}% certainty
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3 flex items-center gap-1.5">
                      {v.status === "overdue" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Overdue
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                          Approaching
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
                Upcoming Reminders
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
                            Overdue
                          </Badge>
                        )}
                        {isDueSoon && (
                          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                            Due Soon
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
                  Recent Messages
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => router.push("/messages")}
                >
                  View All
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
                    onClick={() => router.push("/messages")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{thread.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {thread.lastMessage.direction === "outbound" ? "You: " : ""}
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

        {/* Inspections */}
        {isVisible("inspections") && (inProgressInspections.length > 0 || completedInspections.length > 0) && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4" />
                Inspections
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
                            {insp.template.name} · {inspected}/{total} items
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
                          In Progress
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
                          Completed
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
                Quote Requests
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Customers requesting quotes from shared inspections
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
                            {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} requested
                            {req.message && ` · "${req.message}"`}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-1.5">
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                          Pending
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
                          Create Quote
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
                Customer Quote Responses
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Quotes that customers have accepted or requested changes on
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
                          {resp.status === "accepted" ? "Accepted" : "Changes requested"}
                          {resp.customerMessage && ` · "${resp.customerMessage}"`}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3 flex items-center gap-1.5">
                      {resp.status === "accepted" ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          Accepted
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">
                          Changes Requested
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
                          Convert to Work Order
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => router.push(`/quotes/${resp.id}`)}
                      >
                        View Quote
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
              <CardTitle className="text-base">Recent Completed</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-22.5">Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="hidden sm:table-cell">Customer</TableHead>
                    <TableHead>Title</TableHead>
                    {stats.isAdmin && <TableHead className="w-22.5 text-right">Total</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentServices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={stats.isAdmin ? 5 : 4} className="h-20 text-center text-muted-foreground">
                        No completed services yet
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
              <CardTitle className="text-base">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="hidden sm:table-cell">Customer</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-27.5">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Tech</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.todaysServices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        No active jobs
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
