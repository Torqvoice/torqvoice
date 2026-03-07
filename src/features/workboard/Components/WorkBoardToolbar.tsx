"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar, Monitor, CalendarDays, Clock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";

export type BoardView = "week" | "day";

function formatWeekRange(weekStart: string, locale?: string) {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString(locale, opts);
  const endStr = end.toLocaleDateString(locale, {
    ...opts,
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function formatDayDate(date: string, locale?: string) {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function WorkBoardToolbar({
  weekStart,
  selectedDate,
  view,
  onPrevWeek,
  onNextWeek,
  onPrevDay,
  onNextDay,
  onToday,
  onAddTech,
  onViewChange,
}: {
  weekStart: string;
  selectedDate: string;
  view: BoardView;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onAddTech: () => void;
  onViewChange: (view: BoardView) => void;
}) {
  const t = useTranslations("workBoard.toolbar");
  const locale = useLocale();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          <Calendar className="mr-1.5 h-3.5 w-3.5" />
          {t("today")}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={view === "week" ? onPrevWeek : onPrevDay}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-medium">
            {view === "week"
              ? formatWeekRange(weekStart, locale)
              : formatDayDate(selectedDate, locale)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={view === "week" ? onNextWeek : onNextDay}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* View toggle */}
        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => onViewChange("day")}
            className={cn(
              "flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "day"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {t("day")}
          </button>
          <button
            type="button"
            onClick={() => onViewChange("week")}
            className={cn(
              "flex items-center gap-1 rounded-r-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "week"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("week")}
          </button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/work-board/presenter" target="_blank">
            <Monitor className="mr-1.5 h-3.5 w-3.5" />
            {t("presenter")}
          </Link>
        </Button>
        <Button size="sm" onClick={onAddTech}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("addTechnician")}
        </Button>
      </div>
    </div>
  );
}
