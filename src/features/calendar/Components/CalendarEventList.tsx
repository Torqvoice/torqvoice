"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CalendarEvent } from "../Actions/calendarActions";

function getStatusColor(event: CalendarEvent) {
  if (event.type === "service") {
    switch (event.status) {
      case "completed": return "bg-emerald-500";
      case "in_progress": return "bg-blue-500";
      default: return "bg-amber-500";
    }
  }
  // reminder
  switch (event.status) {
    case "completed": return "bg-emerald-500";
    case "overdue": return "bg-red-500";
    default: return "bg-muted-foreground";
  }
}

function getStatusBadge(event: CalendarEvent) {
  if (event.type === "service") {
    switch (event.status) {
      case "completed": return <Badge variant="outline" className="text-emerald-600 border-emerald-300">Completed</Badge>;
      case "in_progress": return <Badge variant="outline" className="text-blue-600 border-blue-300">In Progress</Badge>;
      default: return <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>;
    }
  }
  switch (event.status) {
    case "completed": return <Badge variant="outline" className="text-emerald-600 border-emerald-300">Done</Badge>;
    case "overdue": return <Badge variant="destructive">Overdue</Badge>;
    default: return <Badge variant="outline">Upcoming</Badge>;
  }
}

interface CalendarEventListProps {
  events: CalendarEvent[];
  selectedDate: Date;
}

export function CalendarEventList({ events, selectedDate }: CalendarEventListProps) {
  const dateStr = selectedDate.toISOString().split("T")[0];
  const dayEvents = events.filter((e) => e.date.split("T")[0] === dateStr);

  if (dayEvents.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No events on {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground mb-3">
        {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>
      {dayEvents.map((event) => (
        <Link
          key={`${event.type}-${event.id}`}
          href={`/vehicles/${event.vehicleId}`}
          className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
          <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusColor(event)}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{event.title}</p>
              {getStatusBadge(event)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{event.vehicleLabel}</p>
            {event.customerName && (
              <p className="text-xs text-muted-foreground">{event.customerName}</p>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {event.type === "service" ? "Service" : "Reminder"}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
