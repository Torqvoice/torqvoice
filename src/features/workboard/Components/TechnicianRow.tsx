"use client";

import { cn } from "@/lib/utils";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import type { Technician } from "../store/workboardStore";
import { BoardDayCell } from "./BoardDayCell";
import { formatDuration } from "./DurationSlider";
import { assignmentOverlapsDate, getAssignmentDateRange, getDurationMinutes } from "../utils/datetime";

export function TechnicianRow({
  technician,
  days,
  assignments,
  onCardClick,
  onTechClick,
}: {
  technician: Technician;
  days: string[];
  assignments: BoardAssignmentWithJob[];
  onCardClick: (assignment: BoardAssignmentWithJob) => void;
  onTechClick?: (technician: Technician) => void;
}) {
  const techAssignments = assignments.filter(
    (a) => a.technicianId === technician.id,
  );

  const weekBooked = techAssignments.reduce((sum, a) => {
    const { start, end } = getAssignmentDateRange(a);
    if (start && end) return sum + getDurationMinutes(start, end);
    return sum;
  }, 0);
  const weekCapacity = technician.dailyCapacity * days.length;
  const weekPct = weekCapacity > 0 ? Math.round((weekBooked / weekCapacity) * 100) : 0;

  return (
    <div className="contents">
      <button
        type="button"
        className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
        onClick={() => onTechClick?.(technician)}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: technician.color }}
          />
          <span className="text-sm font-medium leading-tight">
            {technician.name}
          </span>
        </div>
        <div className="w-full space-y-0.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-background">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                weekPct > 100
                  ? "bg-red-500"
                  : weekPct >= 75
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
              style={{ width: `${Math.min(weekPct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {formatDuration(weekBooked)} / {formatDuration(weekCapacity)}
          </p>
        </div>
      </button>

      {days.map((day) => {
        const cellAssignments = techAssignments.filter(
          (a) => assignmentOverlapsDate(a, day),
        );
        return (
          <BoardDayCell
            key={day}
            technicianId={technician.id}
            date={day}
            assignments={cellAssignments}
            dailyCapacity={technician.dailyCapacity}
            onCardClick={onCardClick}
          />
        );
      })}
    </div>
  );
}
