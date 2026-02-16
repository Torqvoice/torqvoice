"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CalendarDayCell } from "./CalendarDayCell";
import { CalendarEventList } from "./CalendarEventList";
import { getCalendarEvents } from "../Actions/calendarActions";
import type { CalendarEvent } from "../Actions/calendarActions";

interface CalendarClientProps {
  initialEvents: CalendarEvent[];
  initialMonth: number;
  initialYear: number;
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

  // Next month padding (fill to 42 or at least complete the last week)
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

export default function CalendarClient({ initialEvents, initialMonth, initialYear }: CalendarClientProps) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const days = getMonthDays(year, month);

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const result = await getCalendarEvents({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
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
    fetchEvents(newYear, newMonth);
  };

  const goToNext = () => {
    const newMonth = month === 11 ? 0 : month + 1;
    const newYear = month === 11 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    fetchEvents(newYear, newMonth);
  };

  const goToToday = () => {
    const t = new Date();
    setMonth(t.getMonth());
    setYear(t.getFullYear());
    setSelectedDate(t);
    if (t.getMonth() !== month || t.getFullYear() !== year) {
      fetchEvents(t.getFullYear(), t.getMonth());
    }
  };

  // Sync selected date when month changes
  useEffect(() => {
    setSelectedDate(new Date(year, month, 1));
  }, [month, year]);

  return (
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
              <Button size="sm" variant="outline" onClick={goToToday}>
                Today
              </Button>
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
                const dateStr = date.toISOString().split("T")[0];
                const selStr = selectedDate.toISOString().split("T")[0];
                return (
                  <CalendarDayCell
                    key={dateStr}
                    date={date}
                    events={events}
                    isCurrentMonth={date.getMonth() === month}
                    isToday={dateStr === todayStr}
                    isSelected={dateStr === selStr}
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
            <CalendarEventList events={events} selectedDate={selectedDate} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
