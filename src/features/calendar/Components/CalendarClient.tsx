"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Wrench,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { CalendarDayCell } from "./CalendarDayCell";
import { CalendarEventList } from "./CalendarEventList";
import { toLocalDateStr } from "./calendar-utils";
import { getCalendarEvents } from "../Actions/calendarActions";
import type { CalendarEvent } from "../Actions/calendarActions";
import { VehiclePickerDialog } from "@/components/vehicle-picker-dialog";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customer: { id: string; name: string; company: string | null } | null;
}

interface Customer {
  id: string;
  name: string;
  company: string | null;
}

interface CalendarClientProps {
  initialEvents: CalendarEvent[];
  initialMonth: number;
  initialYear: number;
  initialDay: number;
  todayStr: string; // YYYY-MM-DD computed on server to avoid hydration mismatch
  vehicles: Vehicle[];
  customers: Customer[];
  currencyCode: string;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();

  const days: Date[] = [];

  // Previous month padding
  for (let i = startPad - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Next month padding (fill to complete the last week)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarClient({
  initialEvents,
  initialMonth,
  initialYear,
  initialDay,
  todayStr,
  vehicles,
  customers,
  currencyCode,
}: CalendarClientProps) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(initialYear, initialMonth, initialDay)
  );

  // Filters
  const [showServices, setShowServices] = useState(true);
  const [showReminders, setShowReminders] = useState(true);
  const [showQuotes, setShowQuotes] = useState(true);

  // Vehicle picker
  const [showPicker, setShowPicker] = useState(false);

  const selectedDateStr = toLocalDateStr(selectedDate);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.type === "service" && !showServices) return false;
      if (e.type === "reminder" && !showReminders) return false;
      if (e.type === "quote" && !showQuotes) return false;
      return true;
    });
  }, [events, showServices, showReminders, showQuotes]);

  // Month summary stats
  const stats = useMemo(() => {
    const serviceCount = events.filter((e) => e.type === "service").length;
    const overdueReminders = events.filter(
      (e) => e.type === "reminder" && e.status === "overdue"
    ).length;
    const pendingQuotes = events.filter(
      (e) => e.type === "quote" && e.status !== "approved"
    ).length;
    const totalRevenue = events
      .filter((e) => e.type === "service" && e.amount != null)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    return { serviceCount, overdueReminders, pendingQuotes, totalRevenue };
  }, [events]);

  const days = getMonthDays(year, month);

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const result = await getCalendarEvents({
      start: toLocalDateStr(start),
      end: toLocalDateStr(end),
    });
    if (result.success && result.data) {
      setEvents(result.data);
    }
    setLoading(false);
  }, []);

  const goToPrev = () => {
    const newMonth = month === 0 ? 11 : month - 1;
    const newYear = month === 0 ? year - 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setSelectedDate(new Date(newYear, newMonth, 1));
    fetchEvents(newYear, newMonth);
  };

  const goToNext = () => {
    const newMonth = month === 11 ? 0 : month + 1;
    const newYear = month === 11 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setSelectedDate(new Date(newYear, newMonth, 1));
    fetchEvents(newYear, newMonth);
  };

  const goToToday = () => {
    const t = new Date();
    const needsFetch = t.getMonth() !== month || t.getFullYear() !== year;
    setMonth(t.getMonth());
    setYear(t.getFullYear());
    setSelectedDate(t);
    if (needsFetch) {
      fetchEvents(t.getFullYear(), t.getMonth());
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Wrench className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{stats.serviceCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Services</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{stats.overdueReminders}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <FileText className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{stats.pendingQuotes}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pending Quotes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <span className="text-sm font-bold text-emerald-600">$</span>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none tabular-nums">
                {stats.totalRevenue > 0
                  ? new Intl.NumberFormat(undefined, {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(stats.totalRevenue)
                  : "0"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToPrev}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-semibold ml-2">
                    {MONTH_NAMES[month]} {year}
                  </h2>
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={goToToday}>
                    Today
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowPicker(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Work Order
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4 mb-3 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={showServices}
                    onCheckedChange={(v) => setShowServices(!!v)}
                  />
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Services</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={showReminders}
                    onCheckedChange={(v) => setShowReminders(!!v)}
                  />
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Reminders</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={showQuotes}
                    onCheckedChange={(v) => setShowQuotes(!!v)}
                  />
                  <div className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="text-muted-foreground">Quotes</span>
                </label>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-px mb-1">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-px">
                {days.map((date) => {
                  const dateStr = toLocalDateStr(date);
                  return (
                    <CalendarDayCell
                      key={dateStr}
                      date={date}
                      events={filteredEvents}
                      isCurrentMonth={date.getMonth() === month}
                      isToday={dateStr === todayStr}
                      isSelected={dateStr === selectedDateStr}
                      onClick={() => setSelectedDate(date)}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Event list sidebar */}
        <div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <CalendarEventList
                events={filteredEvents}
                dateStr={selectedDateStr}
                selectedDate={selectedDate}
                currencyCode={currencyCode}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <VehiclePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        vehicles={vehicles}
        customers={customers}
        title="Select Vehicle for Work Order"
      />
    </div>
  );
}
