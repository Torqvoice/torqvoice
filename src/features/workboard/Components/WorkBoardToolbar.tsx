"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar, Monitor } from "lucide-react";

function formatWeekRange(weekStart: string) {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

export function WorkBoardToolbar({
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddTech,
}: {
  weekStart: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddTech: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          <Calendar className="mr-1.5 h-3.5 w-3.5" />
          Today
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-medium">
            {formatWeekRange(weekStart)}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/work-board/presenter" target="_blank">
            <Monitor className="mr-1.5 h-3.5 w-3.5" />
            Presenter
          </Link>
        </Button>
        <Button size="sm" onClick={onAddTech}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Technician
        </Button>
      </div>
    </div>
  );
}
