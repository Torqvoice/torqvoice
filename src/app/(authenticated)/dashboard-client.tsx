"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ClipboardList,
  Clock,
  DollarSign,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

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

export function DashboardClient({
  stats,
  currencyCode = "USD",
  upcomingReminders = [],
}: {
  stats: DashboardStats;
  currencyCode?: string;
  upcomingReminders?: ReminderItem[];
}) {
  const router = useRouter();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div
        className="relative cursor-pointer"
        onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          readOnly
          placeholder="Search by name, plate, phone, VIN, invoice..."
          className="pl-10 cursor-pointer"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ctrl+K
        </kbd>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Total Customers</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats.totalCustomers}</p>
          </CardContent>
        </Card>
      </div>

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
                          {format(new Date(r.dueDate), "MMM d")}
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
                <TableHead className="w-22.5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
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
                        {format(new Date(s.serviceDate), "MM/dd/yy")}
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
                      <TableCell className="text-right font-semibold">
                        <span className="inline-flex items-center gap-2">
                          {navigatingId === s.id && (
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
