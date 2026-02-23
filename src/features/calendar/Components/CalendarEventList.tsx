"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateHeader } from "./calendar-utils";
import { formatCurrency } from "@/lib/format";
import type { CalendarEvent } from "../Actions/calendarActions";

function getStatusColor(event: CalendarEvent) {
  if (event.type === "service") {
    switch (event.status) {
      case "completed": return "bg-emerald-500";
      case "in_progress": case "in-progress": return "bg-blue-500";
      case "waiting-parts": return "bg-orange-500";
      default: return "bg-amber-500";
    }
  }
  if (event.type === "quote") {
    return event.status === "sent" ? "bg-violet-500" : "bg-violet-300";
  }
  switch (event.status) {
    case "completed": return "bg-emerald-500";
    case "overdue": return "bg-red-500";
    default: return "bg-slate-400";
  }
}

function getStatusBadge(event: CalendarEvent) {
  if (event.type === "service") {
    switch (event.status) {
      case "completed": return <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0">Completed</Badge>;
      case "in_progress": case "in-progress": return <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px] px-1.5 py-0">In Progress</Badge>;
      case "waiting-parts": return <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px] px-1.5 py-0">Waiting Parts</Badge>;
      default: return <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">Pending</Badge>;
    }
  }
  if (event.type === "quote") {
    switch (event.status) {
      case "sent": return <Badge variant="outline" className="text-violet-600 border-violet-300 text-[10px] px-1.5 py-0">Sent</Badge>;
      case "approved": return <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0">Approved</Badge>;
      default: return <Badge variant="outline" className="text-violet-600 border-violet-300 text-[10px] px-1.5 py-0">Draft</Badge>;
    }
  }
  switch (event.status) {
    case "completed": return <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0">Done</Badge>;
    case "overdue": return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue</Badge>;
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Upcoming</Badge>;
  }
}

function getTypeBadge(type: CalendarEvent["type"]) {
  switch (type) {
    case "service": return <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400">Service</Badge>;
    case "reminder": return <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400">Reminder</Badge>;
    case "quote": return <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-400">Quote</Badge>;
  }
}

function getEventLink(event: CalendarEvent) {
  if (event.type === "quote") return `/quotes/${event.id}`;
  return `/vehicles/${event.vehicleId}`;
}

interface CalendarEventListProps {
  events: CalendarEvent[];
  dateStr: string; // YYYY-MM-DD
  selectedDate: Date;
  currencyCode: string;
}

export function CalendarEventList({ events, dateStr, selectedDate, currencyCode }: CalendarEventListProps) {
  const dayEvents = events.filter((e) => e.date === dateStr);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        {formatDateHeader(selectedDate)}
      </p>

      {dayEvents.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-1">No events</p>
          <p className="text-xs text-muted-foreground">
            Select a day with events or create a new work order.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((event) => (
            <Link
              key={`${event.type}-${event.id}`}
              href={getEventLink(event)}
              className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
            >
              <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusColor(event)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  {getStatusBadge(event)}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">{event.vehicleLabel}</p>
                  {event.time && (
                    <span className="text-xs text-muted-foreground shrink-0">{event.time}</span>
                  )}
                </div>
                {event.customerName && (
                  <p className="text-xs text-muted-foreground">{event.customerName}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {getTypeBadge(event.type)}
                  {event.invoiceNumber && (
                    <span className="text-[10px] text-muted-foreground">#{event.invoiceNumber}</span>
                  )}
                  {event.amount != null && (
                    <span className="text-[10px] font-medium ml-auto">
                      {formatCurrency(event.amount, currencyCode)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
