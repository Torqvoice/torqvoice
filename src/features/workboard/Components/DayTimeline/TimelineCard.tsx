"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Wrench, ClipboardCheck } from "lucide-react";
import type { WorkBoardJob } from "../../Actions/boardActions";
import { minutesToTime } from "./utils";

export function JobBar({
  job,
  leftPct,
  widthPct,
  colorClass,
  unscheduled,
  isDragging,
  startMins,
  endMins,
  onClick,
  onMoveStart,
  onResizeStartLeft,
  onResizeStartRight,
}: {
  job: WorkBoardJob;
  leftPct: number;
  widthPct: number;
  colorClass: string;
  unscheduled?: boolean;
  isDragging?: boolean;
  startMins: number;
  endMins: number;
  onClick: () => void;
  onMoveStart: (e: React.MouseEvent) => void;
  onResizeStartLeft: (e: React.MouseEvent) => void;
  onResizeStartRight: (e: React.MouseEvent) => void;
}) {
  const isServiceRecord = job.type === "serviceRecord";

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 z-[1] flex items-center overflow-hidden rounded shadow-sm select-none group",
        colorClass,
        unscheduled && "border border-dashed border-current/30 opacity-70",
        isDragging && "opacity-80 ring-2 ring-primary z-[3]",
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      title={`${minutesToTime(startMins)}–${minutesToTime(endMins)} · ${job.title}${job.vehicle ? ` - ${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}` : ""}`}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        const onUp = (upEvent: MouseEvent) => {
          window.removeEventListener("mouseup", onUp);
          if (!mouseDownPos.current) return;
          const dist = Math.abs(upEvent.clientX - mouseDownPos.current.x) + Math.abs(upEvent.clientY - mouseDownPos.current.y);
          if (dist < 5) onClick();
          mouseDownPos.current = null;
        };
        window.addEventListener("mouseup", onUp);
        onMoveStart(e);
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-[2] opacity-0 group-hover:opacity-100 bg-black/10 hover:bg-black/20 rounded-l transition-opacity"
        onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onResizeStartLeft(e); }}
      />
      <div className="flex items-center gap-1 px-3 min-w-0 cursor-grab active:cursor-grabbing text-[11px] font-medium">
        {isServiceRecord ? <Wrench className="h-3 w-3 shrink-0" /> : <ClipboardCheck className="h-3 w-3 shrink-0" />}
        {isDragging ? (
          <span className="font-semibold whitespace-nowrap">{minutesToTime(startMins)} – {minutesToTime(endMins)}</span>
        ) : (
          <span className="truncate">
            {job.title}
            {job.vehicle ? ` - ${job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`}` : ""}
          </span>
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-[2] opacity-0 group-hover:opacity-100 bg-black/10 hover:bg-black/20 rounded-r transition-opacity"
        onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onResizeStartRight(e); }}
      />
    </div>
  );
}

export function CurrentTimeIndicator({
  dayStartMins,
  totalMinutes,
  date,
}: {
  dayStartMins: number;
  totalMinutes: number;
  date: string;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (date !== today) return null;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const leftPct = ((nowMins - dayStartMins) / totalMinutes) * 100;
  if (leftPct < 0 || leftPct > 100) return null;

  return (
    <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-500 pointer-events-none" style={{ left: `${leftPct}%` }}>
      <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-red-500" />
    </div>
  );
}
