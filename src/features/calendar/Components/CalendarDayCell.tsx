"use client";

import type { CalendarEvent } from "../Actions/calendarActions";

function getEventDotColor(event: CalendarEvent) {
  if (event.type === "service") {
    switch (event.status) {
      case "completed": return "bg-emerald-500";
      case "in_progress": return "bg-blue-500";
      default: return "bg-amber-500";
    }
  }
  switch (event.status) {
    case "completed": return "bg-emerald-500";
    case "overdue": return "bg-red-500";
    default: return "bg-muted-foreground";
  }
}

interface CalendarDayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function CalendarDayCell({ date, events, isCurrentMonth, isToday, isSelected, onClick }: CalendarDayCellProps) {
  const dateStr = date.toISOString().split("T")[0];
  const dayEvents = events.filter((e) => e.date.split("T")[0] === dateStr);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-start p-1.5 min-h-[72px] w-full rounded-md text-sm transition-colors
        ${isCurrentMonth ? "" : "text-muted-foreground/40"}
        ${isToday ? "bg-primary/10 font-semibold" : ""}
        ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}
      `}
    >
      <span className={`text-xs ${isToday ? "text-primary font-bold" : ""}`}>
        {date.getDate()}
      </span>
      {dayEvents.length > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-full">
          {dayEvents.slice(0, 4).map((event) => (
            <div
              key={`${event.type}-${event.id}`}
              className={`h-1.5 w-1.5 rounded-full ${getEventDotColor(event)}`}
            />
          ))}
          {dayEvents.length > 4 && (
            <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}
