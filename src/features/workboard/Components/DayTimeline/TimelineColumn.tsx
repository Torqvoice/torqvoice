"use client";

import { useRef, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { BoardAssignmentWithJob } from "../../Actions/boardActions";
import type { Technician } from "../../store/workboardStore";
import { formatDuration } from "../DurationSlider";
import { getAssignmentDateRange, getDurationMinutes } from "../../utils/datetime";
import { getResolvedRange, BAR_COLORS, minutesToTime } from "./utils";
import { JobBar, CurrentTimeIndicator } from "./TimelineCard";
import type { DragState, DragOverride, DragMode } from "./index";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

export function TechTimelineRow({
  tech,
  date,
  dayAssignments,
  dayStartMins,
  dayEndMins,
  totalMinutes,
  hourSlots,
  drag,
  dragOverride,
  startDrag,
  onCardClick,
  onTechClick,
  onCreateWorkOrder,
  cancelPendingDrag,
  registerRef,
}: {
  tech: Technician;
  date: string;
  dayAssignments: BoardAssignmentWithJob[];
  dayStartMins: number;
  dayEndMins: number;
  totalMinutes: number;
  hourSlots: string[];
  drag: DragState | null;
  dragOverride: DragOverride | null;
  startDrag: (e: React.MouseEvent, a: BoardAssignmentWithJob, mode: DragMode, el: HTMLElement) => void;
  onCardClick: (a: BoardAssignmentWithJob) => void;
  onTechClick?: (t: Technician) => void;
  onCreateWorkOrder?: (techId: string, startTime: string, endTime: string) => void;
  cancelPendingDrag: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const t = useTranslations("workBoard.board");
  const timelineRef = useRef<HTMLDivElement>(null);
  const contextClickTimeRef = useRef<number>(dayStartMins);
  const techJobs = dayAssignments.filter((a) => a.technicianId === tech.id);

  const bookedMinutes = techJobs.reduce((sum, a) => {
    const { start, end } = getAssignmentDateRange(a);
    return start && end ? sum + getDurationMinutes(start, end) : sum;
  }, 0);

  const isDropTarget = drag && dragOverride && dragOverride.techId === tech.id && drag.origTechId !== tech.id;
  const droppableId = `${tech.id}::${date}`;
  const { isOver, setNodeRef } = useDroppable({ id: droppableId, data: { technicianId: tech.id, date } });
  const rowRef = useCallback((el: HTMLDivElement | null) => { setNodeRef(el); registerRef(el); }, [setNodeRef, registerRef]);

  const ghostBar = drag && dragOverride && dragOverride.techId === tech.id && drag.origTechId !== tech.id ? dragOverride : null;

  return (
    <div ref={rowRef} className={cn("flex border-b last:border-b-0 transition-colors", (isOver || isDropTarget) && "bg-primary/5")}>
      <button type="button" className="flex w-[160px] shrink-0 flex-col justify-center gap-1 border-r p-2 text-left transition-colors hover:bg-muted/50" onClick={() => onTechClick?.(tech)}>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tech.color }} />
          <span className="text-sm font-medium leading-tight">{tech.name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatDuration(bookedMinutes)} / {formatDuration(tech.dailyCapacity)}
        </span>
      </button>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={timelineRef}
            className="relative flex-1"
            style={{ minHeight: "56px" }}
            onContextMenu={(e) => {
              if (timelineRef.current) {
                const rect = timelineRef.current.getBoundingClientRect();
                const xPct = (e.clientX - rect.left) / rect.width;
                contextClickTimeRef.current = Math.round((dayStartMins + xPct * totalMinutes) / 15) * 15;
              }
            }}
          >
            <div className="absolute inset-0 flex">
              {hourSlots.map((slot) => (
                <div key={slot} className="flex-1 border-r border-dashed border-border/50 transition-colors duration-150 hover:bg-muted/40" />
              ))}
            </div>
            <CurrentTimeIndicator dayStartMins={dayStartMins} totalMinutes={totalMinutes} date={date} />

            {techJobs.map((assignment, jobIdx) => {
              const isDragged = drag?.assignmentId === assignment.id;
              const sr = assignment.serviceRecord;
              const insp = assignment.inspection;
              const resolved = getResolvedRange(sr?.startDateTime ?? insp?.startDateTime, sr?.endDateTime ?? insp?.endDateTime, dayStartMins);
              let { startMins, endMins } = resolved;

              if (isDragged && dragOverride) {
                if (dragOverride.techId !== tech.id) return null;
                startMins = dragOverride.startMins;
                endMins = dragOverride.endMins;
              }

              const leftPct = ((startMins - dayStartMins) / totalMinutes) * 100;
              const widthPct = ((endMins - startMins) / totalMinutes) * 100;

              return (
                <JobBar
                  key={assignment.id}
                  assignment={assignment}
                  leftPct={Math.max(leftPct, 0)}
                  widthPct={Math.max(widthPct, 1)}
                  colorClass={BAR_COLORS[jobIdx % BAR_COLORS.length]}
                  unscheduled={resolved.isUnscheduled && !isDragged}
                  isDragging={isDragged}
                  startMins={startMins}
                  endMins={endMins}
                  onClick={() => { cancelPendingDrag(); if (!isDragged) onCardClick(assignment); }}
                  onMoveStart={(e) => { if (timelineRef.current) startDrag(e, assignment, "move", timelineRef.current); }}
                  onResizeStartLeft={(e) => { if (timelineRef.current) startDrag(e, assignment, "resize-start", timelineRef.current); }}
                  onResizeStartRight={(e) => { if (timelineRef.current) startDrag(e, assignment, "resize-end", timelineRef.current); }}
                />
              );
            })}

            {ghostBar && drag && (
              <div
                className={cn("absolute top-1 bottom-1 z-[2] rounded shadow-sm border-2 border-dashed pointer-events-none", "border-primary bg-primary/10")}
                style={{
                  left: `${Math.max(((ghostBar.startMins - dayStartMins) / totalMinutes) * 100, 0)}%`,
                  width: `${Math.max(((ghostBar.endMins - ghostBar.startMins) / totalMinutes) * 100, 1)}%`,
                }}
              />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => {
            const startMins = contextClickTimeRef.current ?? dayStartMins;
            const endMins = Math.min(startMins + 60, dayStartMins + totalMinutes);
            onCreateWorkOrder?.(tech.id, minutesToTime(startMins), minutesToTime(endMins));
          }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createNewWorkorder")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
