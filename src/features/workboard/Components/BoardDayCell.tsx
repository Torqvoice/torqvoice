"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import { BoardJobCard } from "./BoardJobCard";

export function BoardDayCell({
  technicianId,
  date,
  assignments,
  onCardClick,
}: {
  technicianId: string;
  date: string;
  assignments: BoardAssignmentWithJob[];
  onCardClick: (assignment: BoardAssignmentWithJob) => void;
}) {
  const droppableId = `${technicianId}::${date}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: { technicianId, date },
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = date === today;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[80px] flex-col gap-1 rounded-md border p-1 transition-colors",
        isOver && "border-primary bg-primary/5",
        isToday && "border-primary/30 bg-primary/5",
      )}
    >
      {assignments.map((a) => (
        <BoardJobCard
          key={a.id}
          assignment={a}
          onClick={() => onCardClick(a)}
        />
      ))}
    </div>
  );
}
