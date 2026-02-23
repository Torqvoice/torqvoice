"use client";

import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import type { Technician } from "../store/workboardStore";
import { BoardDayCell } from "./BoardDayCell";

export function TechnicianRow({
  technician,
  days,
  assignments,
  onCardClick,
}: {
  technician: Technician;
  days: string[];
  assignments: BoardAssignmentWithJob[];
  onCardClick: (assignment: BoardAssignmentWithJob) => void;
}) {
  return (
    <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-1">
      {/* Tech name column */}
      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
        <div
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: technician.color }}
        />
        <span className="text-sm font-medium leading-tight">
          {technician.name}
        </span>
      </div>

      {/* Day cells */}
      {days.map((day) => {
        const cellAssignments = assignments.filter(
          (a) => a.technicianId === technician.id && a.date === day,
        );
        return (
          <BoardDayCell
            key={day}
            technicianId={technician.id}
            date={day}
            assignments={cellAssignments}
            onCardClick={onCardClick}
          />
        );
      })}
    </div>
  );
}
