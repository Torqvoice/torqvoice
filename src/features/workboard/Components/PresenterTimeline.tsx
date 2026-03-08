"use client";

import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { WorkBoardJob } from "../Actions/boardActions";
import type { Technician } from "../store/workboardStore";
import { Wrench, ClipboardCheck } from "lucide-react";
import { jobOverlapsDate, getJobDateRange, getDurationMinutes } from "../utils/datetime";
import { formatDuration } from "./DurationSlider";
import { useTranslations } from "next-intl";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1439, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getHourSlots(startTime: string, endTime: string): string[] {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const slots: string[] = [];
  for (let m = startMins; m < endMins; m += 60) slots.push(minutesToTime(m));
  return slots;
}

const BAR_COLORS = [
  "bg-sky-400/80 text-sky-950 dark:bg-sky-600/80 dark:text-sky-50",
  "bg-emerald-400/80 text-emerald-950 dark:bg-emerald-600/80 dark:text-emerald-50",
  "bg-amber-400/80 text-amber-950 dark:bg-amber-600/80 dark:text-amber-50",
  "bg-violet-400/80 text-violet-950 dark:bg-violet-600/80 dark:text-violet-50",
  "bg-rose-400/80 text-rose-950 dark:bg-rose-600/80 dark:text-rose-50",
  "bg-cyan-400/80 text-cyan-950 dark:bg-cyan-600/80 dark:text-cyan-50",
  "bg-lime-400/80 text-lime-950 dark:bg-lime-600/80 dark:text-lime-50",
  "bg-orange-400/80 text-orange-950 dark:bg-orange-600/80 dark:text-orange-50",
];

export function PresenterTimeline({
  date,
  technicians,
  assignments,
  workDayStart,
  workDayEnd,
}: {
  date: string;
  technicians: Technician[];
  assignments: WorkBoardJob[];
  workDayStart: string;
  workDayEnd: string;
}) {
  const t = useTranslations("workBoard.presenter");
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
        const d = new Date(endStr);
        const endMins = d.getHours() * 60 + d.getMinutes();
        if (endMins > max) max = endMins;
      }
    }
    return max > baseEndMins ? Math.ceil(max / 60) * 60 : baseEndMins;
  }, [dayAssignments, baseEndMins]);

  const totalMinutes = dayEndMins - dayStartMins;
  const hourSlots = useMemo(() => getHourSlots(workDayStart, minutesToTime(dayEndMins)), [workDayStart, dayEndMins]);

  if (technicians.length === 0) {
    return <div className="flex flex-1 items-center justify-center"><p className="text-lg text-muted-foreground">{t("noTechnicians")}</p></div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="min-w-[900px]">
        <div className="flex border-b">
          <div className="w-[180px] shrink-0 border-r p-2" />
          <div className="relative flex-1">
            <div className="flex">
              {hourSlots.map((slot) => (
                <div key={slot} className="flex-1 border-r px-1 py-2 text-center text-xs font-semibold text-muted-foreground">{slot}</div>
              ))}
            </div>
          </div>
        </div>

        {technicians.map((tech) => {
          const techJobs = dayAssignments.filter((a) => a.technicianId === tech.id).sort((a, b) => a.sortOrder - b.sortOrder);
          const bookedMinutes = techJobs.reduce((sum, a) => {
            const { start, end } = getJobDateRange(a);
            return start && end ? sum + getDurationMinutes(start, end) : sum;
          }, 0);

          return (
            <div key={tech.id} className="flex border-b last:border-b-0">
              <div className="flex w-[180px] shrink-0 flex-col justify-center gap-1 border-r p-3">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: tech.color }} />
                  <span className="text-sm font-semibold">{tech.name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {techJobs.length === 1 ? t("job", { count: techJobs.length }) : t("jobs", { count: techJobs.length })}
                  {" · "}
                  {formatDuration(bookedMinutes)}
                </span>
              </div>

              <div className="relative flex-1" style={{ minHeight: "64px" }}>
                <div className="absolute inset-0 flex pointer-events-none">
                  {hourSlots.map((slot) => (<div key={slot} className="flex-1 border-r border-dashed border-border/50" />))}
                </div>
                <PresenterCurrentTime dayStartMins={dayStartMins} totalMinutes={totalMinutes} date={date} />

                {techJobs.map((job, jobIdx) => {
                  const startStr = job.startDateTime;
                  const endStr = job.endDateTime;
                  let startMins = dayStartMins, endMins = dayStartMins + 60;
                  if (startStr) { const d = new Date(startStr); startMins = d.getHours() * 60 + d.getMinutes(); }
                  if (endStr) { const d = new Date(endStr); endMins = d.getHours() * 60 + d.getMinutes(); }
                  const isUnscheduled = !startStr || !endStr;
                  const leftPct = ((startMins - dayStartMins) / totalMinutes) * 100;
                  const widthPct = ((endMins - startMins) / totalMinutes) * 100;
                  const isServiceRecord = job.type === "serviceRecord";

                  return (
                    <div
                      key={job.id}
                      className={cn("absolute top-1 bottom-1 z-[1] flex items-center overflow-hidden rounded shadow-sm select-none", BAR_COLORS[jobIdx % BAR_COLORS.length], isUnscheduled && "border border-dashed border-current/30 opacity-70")}
                      style={{ left: `${Math.max(leftPct, 0)}%`, width: `${Math.max(widthPct, 1)}%` }}
                      title={`${minutesToTime(startMins)}–${minutesToTime(endMins)} · ${job.title}${job.vehicle ? ` - ${job.vehicle.make} ${job.vehicle.model}` : ""}`}
                    >
                      <div className="flex items-center gap-1.5 px-3 min-w-0 text-xs font-semibold">
                        {isServiceRecord ? <Wrench className="h-3.5 w-3.5 shrink-0" /> : <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{job.title}{job.vehicle ? ` - ${job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`}` : ""}</span>
                        <span className="ml-auto shrink-0 text-[10px] opacity-75">{minutesToTime(startMins)}–{minutesToTime(endMins)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PresenterCurrentTime({ dayStartMins, totalMinutes, date }: { dayStartMins: number; totalMinutes: number; date: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
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
