"use client";

import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import type { Technician } from "../store/workboardStore";
import { BoardDayCell } from "./BoardDayCell";

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
  return (
    <div className="contents">
      {/* Tech name column */}
      <button
        type="button"
        className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
        onClick={() => onTechClick?.(technician)}
      >
        <div
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: technician.color }}
        />
        <span className="text-sm font-medium leading-tight">
          {technician.name}
        </span>
      </button>

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
