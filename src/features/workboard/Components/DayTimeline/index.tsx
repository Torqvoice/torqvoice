"use client";

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { WorkBoardJob } from "../../Actions/boardActions";
import type { Technician } from "../../store/workboardStore";
import { useWorkBoardStore } from "../../store/workboardStore";
import { jobOverlapsDate } from "../../utils/datetime";
import { timeToMinutes, minutesToTime } from "./utils";
import { TechTimelineRow } from "./TimelineColumn";
import { useTranslations } from "next-intl";

const SNAP_MINUTES = 5;

function snapMinutes(mins: number): number {
  return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
}

function getHourSlots(startTime: string, endTime: string): string[] {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const slots: string[] = [];
  for (let m = startMins; m < endMins; m += 60) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  assignmentId: string;
  mode: DragMode;
  origStartMins: number;
  origEndMins: number;
  origTechId: string;
  anchorX: number;
  anchorY: number;
  timelineWidth: number;
};

type DragOverride = {
  startMins: number;
  endMins: number;
  techId: string;
};

export { type DragMode, type DragState, type DragOverride };

export function DayTimeline({
  date,
  technicians,
  assignments,
  workDayStart,
  workDayEnd,
  onCardClick,
  onTechClick,
  onCreateWorkOrder,
}: {
  date: string;
  technicians: Technician[];
  assignments: WorkBoardJob[];
  workDayStart: string;
  workDayEnd: string;
  onCardClick: (job: WorkBoardJob) => void;
  onTechClick?: (technician: Technician) => void;
  onCreateWorkOrder?: (techId: string, startTime: string, endTime: string) => void;
}) {
  const store = useWorkBoardStore();
  const dayStartMins = timeToMinutes(workDayStart);
  const baseEndMins = timeToMinutes(workDayEnd);

  const dayAssignments = useMemo(
    () => assignments.filter((a) => jobOverlapsDate(a, date)),
    [assignments, date],
  );

  const dayEndMins = useMemo(() => {
    let max = baseEndMins;
    for (const a of dayAssignments) {
      const endStr = a.endDateTime;
      if (endStr) {
        const end = new Date(endStr);
        const endMins = end.getHours() * 60 + end.getMinutes();
        if (endMins > max) max = endMins;
      }
    }
    return max > baseEndMins ? Math.ceil(max / 60) * 60 : baseEndMins;
  }, [dayAssignments, baseEndMins]);

  const totalMinutes = dayEndMins - dayStartMins;
  const hourSlots = useMemo(
    () => getHourSlots(workDayStart, minutesToTime(dayEndMins)),
    [workDayStart, dayEndMins],
  );

  const techRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOverride, setDragOverride] = useState<DragOverride | null>(null);
  const dragOverrideRef = useRef<DragOverride | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<DragState | null>(null);
  const [hasPending, setHasPending] = useState(false);

  const cancelPendingDrag = useCallback(() => {
    pendingDragRef.current = null;
    dragRef.current = null;
    setHasPending(false);
    setDrag(null);
    setDragOverride(null);
    dragOverrideRef.current = null;
  }, []);

  const getTechAtY = useCallback((clientY: number): string | null => {
    for (const [techId, el] of techRowRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return techId;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !dragRef.current) {
        const dist = Math.abs(e.clientX - pending.anchorX) + Math.abs(e.clientY - pending.anchorY);
        if (dist < 5) return;
        dragRef.current = pending;
        pendingDragRef.current = null;
        setHasPending(false);
        setDrag(pending);
      }
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.anchorX;
      const dMins = snapMinutes((dx / d.timelineWidth) * totalMinutes);
      let newStart = d.origStartMins, newEnd = d.origEndMins;
      if (d.mode === "move") { newStart += dMins; newEnd += dMins; }
      else if (d.mode === "resize-start") { newStart = Math.max(dayStartMins, Math.min(d.origStartMins + dMins, d.origEndMins - SNAP_MINUTES)); }
      else { newEnd = Math.min(dayEndMins, Math.max(d.origEndMins + dMins, d.origStartMins + SNAP_MINUTES)); }
      let targetTech = d.origTechId;
      if (d.mode === "move") { const h = getTechAtY(e.clientY); if (h) targetTech = h; }
      if (newStart < dayStartMins) { if (d.mode === "move") newEnd += dayStartMins - newStart; newStart = dayStartMins; }
      if (newEnd > dayEndMins) { if (d.mode === "move") newStart -= newEnd - dayEndMins; newEnd = dayEndMins; }
      const override: DragOverride = { startMins: newStart, endMins: newEnd, techId: targetTech };
      dragOverrideRef.current = override;
      setDragOverride(override);
    },
    [totalMinutes, dayStartMins, dayEndMins, getTechAtY],
  );

  const handleMouseUp = useCallback(async () => {
    if (pendingDragRef.current) { pendingDragRef.current = null; setHasPending(false); return; }
    const d = dragRef.current;
    const override = dragOverrideRef.current;
    setDrag(null); setDragOverride(null); dragRef.current = null; dragOverrideRef.current = null;
    if (!d || !override) return;
    if (override.startMins === d.origStartMins && override.endMins === d.origEndMins && override.techId === d.origTechId) return;

    const newStartDate = new Date(date + "T00:00:00");
    newStartDate.setMinutes(override.startMins);
    const newEndDate = new Date(date + "T00:00:00");
    newEndDate.setMinutes(override.endMins);

    // Find the job to get its type
    const job = store.jobs.find((x) => x.id === d.assignmentId);

    if (override.techId !== d.origTechId) {
      store.optimisticMove(d.assignmentId, override.techId);
      store.updateServiceTimes(d.assignmentId, newStartDate.toISOString(), newEndDate.toISOString());
      const { moveJob, updateServiceTimes: updateST } = await import("../../Actions/boardActions");
      const res = await moveJob({ id: d.assignmentId, technicianId: override.techId, sortOrder: 0, type: job?.type ?? "serviceRecord" });
      if (!res.success) { store.optimisticMove(d.assignmentId, d.origTechId); } else if (res.data) { store.updateJob(res.data as WorkBoardJob); }
      await updateST({ id: d.assignmentId, startDateTime: newStartDate, endDateTime: newEndDate });
    } else {
      store.updateServiceTimes(d.assignmentId, newStartDate.toISOString(), newEndDate.toISOString());
      const { updateServiceTimes: updateST } = await import("../../Actions/boardActions");
      await updateST({ id: d.assignmentId, startDateTime: newStartDate, endDateTime: newEndDate });
    }
  }, [store, date]);

  useEffect(() => {
    if (!drag && !hasPending) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [drag, hasPending, handleMouseMove, handleMouseUp]);

  const startDrag = (e: React.MouseEvent, job: WorkBoardJob, mode: DragMode, timelineEl: HTMLElement) => {
    e.preventDefault(); e.stopPropagation();
    const startStr = job.startDateTime;
    const endStr = job.endDateTime;
    let startMins = dayStartMins, endMins = dayStartMins + 60;
    if (startStr) { const d = new Date(startStr); startMins = d.getHours() * 60 + d.getMinutes(); }
    if (endStr) { const d = new Date(endStr); endMins = d.getHours() * 60 + d.getMinutes(); }
    pendingDragRef.current = { assignmentId: job.id, mode, origStartMins: startMins, origEndMins: endMins, origTechId: job.technicianId!, anchorX: e.clientX, anchorY: e.clientY, timelineWidth: timelineEl.getBoundingClientRect().width };
    setHasPending(true);
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="min-w-[900px]">
        <div className="flex border-b">
          <div className="w-[160px] shrink-0 border-r p-2">
            <span className="text-xs font-medium text-muted-foreground">Technician</span>
          </div>
          <div className="relative flex-1">
            <div className="flex">
              {hourSlots.map((slot) => (
                <div key={slot} className="flex-1 border-r px-1 py-2 text-center text-[11px] font-medium text-muted-foreground">{slot}</div>
              ))}
            </div>
          </div>
        </div>
        {technicians.map((tech) => (
          <TechTimelineRow
            key={tech.id}
            tech={tech}
            date={date}
            dayAssignments={dayAssignments}
            dayStartMins={dayStartMins}
            dayEndMins={dayEndMins}
            totalMinutes={totalMinutes}
            hourSlots={hourSlots}
            drag={drag}
            dragOverride={dragOverride}
            startDrag={startDrag}
            onCardClick={onCardClick}
            onTechClick={onTechClick}
            onCreateWorkOrder={onCreateWorkOrder}
            cancelPendingDrag={cancelPendingDrag}
            registerRef={(el) => { if (el) techRowRefs.current.set(tech.id, el); else techRowRefs.current.delete(tech.id); }}
          />
        ))}
      </div>
    </div>
  );
}
