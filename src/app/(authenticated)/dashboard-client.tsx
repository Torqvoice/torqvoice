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
import { statusColors } from "@/lib/table-utils";
import {
  AlertTriangle,
  Bell,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  Gauge,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { dismissMaintenance } from "@/features/vehicles/Actions/dismissMaintenance";

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

export function DashboardClient({
  stats,
  currencyCode = "USD",
  upcomingReminders = [],
  vehiclesDueForService = [],
  unitSystem = "imperial",
  inProgressInspections = [],
  completedInspections = [],
}: {
  stats: DashboardStats;
  currencyCode?: string;
  upcomingReminders?: ReminderItem[];
  vehiclesDueForService?: VehicleDueForService[];
  unitSystem?: "metric" | "imperial";
  inProgressInspections?: DashboardInspection[];
  completedInspections?: DashboardInspection[];
}) {
  const distUnit = unitSystem === "metric" ? "km" : "mi";
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDismiss = (vehicleId: string) => {
    setDismissingId(vehicleId);
    startTransition(async () => {
      await dismissMaintenance(vehicleId);
      setDismissingId(null);
    });
  };

  return (
    <div className="space-y-6">
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

      {/* Vehicles Due for Service */}
      {vehiclesDueForService.length > 0 && (
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
      {upcomingReminders.length > 0 && (
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

      {/* Inspections */}
      {(inProgressInspections.length > 0 || completedInspections.length > 0) && (
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

      {/* Recent Completed table */}
      <Card className="border-0 shadow-sm">
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

            {/* Active Jobs table */}
      <Card className="border-0 shadow-sm">
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
    </div>
  );
}
