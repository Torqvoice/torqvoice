"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { WorkBoardJob } from "../Actions/boardActions";
import { BoardJobCard } from "./BoardJobCard";
import { formatDuration } from "./DurationSlider";
import { getJobDateRange, getDurationMinutes } from "../utils/datetime";

export function CapacityBar({
  bookedMinutes,
  capacityMinutes,
}: {
  bookedMinutes: number;
  capacityMinutes: number;
}) {
  if (bookedMinutes === 0 && capacityMinutes === 0) return null;

  const pct = capacityMinutes > 0 ? Math.min((bookedMinutes / capacityMinutes) * 100, 100) : 0;
  const isOver = bookedMinutes > capacityMinutes;

  return (
    <div className="mt-auto space-y-0.5 border-t pt-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOver
              ? "bg-red-500"
              : pct >= 75
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className={cn(
        "text-center text-[10px] font-medium",
        isOver ? "text-red-500" : "text-muted-foreground",
      )}>
        {formatDuration(bookedMinutes)} / {formatDuration(capacityMinutes)}
      </p>
    </div>
  );
}

function getBookedMinutes(jobs: WorkBoardJob[]): number {
  return jobs.reduce((sum, a) => {
    const { start, end } = getJobDateRange(a);
    if (start && end) return sum + getDurationMinutes(start, end);
    return sum;
  }, 0);
}

export function BoardDayCell({
  technicianId,
  date,
  assignments,
  dailyCapacity,
  onCardClick,
}: {
  technicianId: string;
  date: string;
  assignments: WorkBoardJob[];
  dailyCapacity: number;
  onCardClick: (job: WorkBoardJob) => void;
}) {
  const droppableId = `${technicianId}::${date}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: { technicianId, date },
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = date === today;

  const bookedMinutes = getBookedMinutes(assignments);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[80px] flex-col gap-1 overflow-hidden rounded-md border p-1 transition-colors",
        isOver && "border-primary bg-primary/5",
        isToday && "border-primary/30 bg-primary/5",
      )}
    >
      {assignments.map((a) => (
        <BoardJobCard
          key={a.id}
          job={a}
          onClick={() => onCardClick(a)}
        />
      ))}
      <CapacityBar bookedMinutes={bookedMinutes} capacityMinutes={dailyCapacity} />
    </div>
  );
}
