"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { useWorkBoardStore, type Technician } from "../store/workboardStore";
import { useWorkBoardWebSocket } from "../hooks/useWorkBoardWebSocket";
import type { WorkBoardJob } from "../Actions/boardActions";
import {
  getBoardJobs,
  getUnassignedJobs,
  assignTechnician,
  moveJob,
  unassignJob,
} from "../Actions/boardActions";
import { WorkBoardToolbar, type BoardView } from "./WorkBoardToolbar";
import { DayTimeline } from "./DayTimeline";
import type { WorkBoardSettings } from "../Actions/boardActions";
import { TechnicianRow } from "./TechnicianRow";
import { UnassignedJobsPanel } from "./UnassignedJobsPanel";
import { TechnicianDialog } from "./TechnicianDialog";
import { JobDetailPopover } from "./JobDetailPopover";
import { BoardJobCard } from "./BoardJobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Wrench, ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { VehiclePickerDialog } from "@/components/vehicle-picker-dialog";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStartDate(date: Date, weekStartDay: number): string {
  const d = new Date(date);
  const diff = (d.getDay() - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalDateString(d);
}

function getWeekDays(weekStart: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + i);
    days.push(toLocalDateString(d));
  }
  return days;
}

const ALL_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function UnassignedJobOverlayCard({ job, type }: { job: Record<string, unknown>; type: "serviceRecord" | "inspection" }) {
  const isServiceRecord = type === "serviceRecord";
  const vehicle = job.vehicle as { year: number; make: string; model: string; licensePlate: string | null } | undefined;
  const title = isServiceRecord ? (job.title as string) : ((job.template as { name: string })?.name ?? "");
  return (
    <div className="flex items-start gap-1 rounded-md border bg-card p-1.5 text-xs shadow-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {isServiceRecord ? <Wrench className="h-3 w-3 shrink-0 text-blue-500" /> : <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />}
          <span className="truncate font-medium">{title}</span>
        </div>
        {vehicle && <p className="truncate text-muted-foreground">{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}</p>}
      </div>
    </div>
  );
}

export function WorkBoardClient({
  initialTechnicians,
  initialAssignments,
  initialUnassigned,
  initialWeekStart,
  boardSettings,
}: {
  initialTechnicians: Technician[];
  initialAssignments: WorkBoardJob[];
  initialUnassigned: { serviceRecords: unknown[]; inspections: unknown[] };
  initialWeekStart: string;
  boardSettings: WorkBoardSettings;
}) {
  const store = useWorkBoardStore();
  const t = useTranslations("workBoard.board");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlView = searchParams.get("view") as BoardView | null;
  const urlDate = searchParams.get("date");
  const urlWeek = searchParams.get("week");

  useEffect(() => {
    store.setTechnicians(initialTechnicians);
    store.setJobs(initialAssignments);
    store.setUnassigned(initialUnassigned.serviceRecords as Parameters<typeof store.setUnassigned>[0], initialUnassigned.inspections as Parameters<typeof store.setUnassigned>[1]);
    store.setWeekStart(urlWeek || initialWeekStart);
    if (urlWeek && urlWeek !== initialWeekStart) {
      getBoardJobs(urlWeek).then((res) => { if (res.success && res.data) store.setJobs(res.data as WorkBoardJob[]); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useWorkBoardWebSocket();

  const [view, setViewState] = useState<BoardView>(urlView === "day" || urlView === "week" ? urlView : "week");
  const [selectedDate, setSelectedDateState] = useState(urlDate || toLocalDateString(new Date()));
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [selectedJob, setSelectedJob] = useState<WorkBoardJob | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ id: string; job?: WorkBoardJob; unassignedJob?: { job: Record<string, unknown>; type: "serviceRecord" | "inspection" } } | null>(null);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [vehiclePickerVehicles, setVehiclePickerVehicles] = useState<{ id: string; make: string; model: string; year: number; licensePlate: string | null; customer: { id: string; name: string; company: string | null } | null }[]>([]);
  const [vehiclePickerCustomers, setVehiclePickerCustomers] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [boardContext, setBoardContext] = useState<Record<string, string>>({});

  const weekStart = store.weekStart || initialWeekStart;
  const days = getWeekDays(weekStart);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const updateUrl = useCallback((newView: BoardView, newDate: string, newWeekStart: string) => {
    const params = new URLSearchParams(); params.set("view", newView); params.set("date", newDate); params.set("week", newWeekStart);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  const setView = useCallback((v: BoardView) => { setViewState(v); updateUrl(v, selectedDate, weekStart); }, [selectedDate, weekStart, updateUrl]);
  const setSelectedDate = useCallback((d: string) => { setSelectedDateState(d); updateUrl(view, d, weekStart); }, [view, weekStart, updateUrl]);

  const loadWeekData = useCallback(async (ws: string) => {
    store.setWeekStart(ws); updateUrl(view, selectedDate, ws);
    const [assignRes, unassignedRes] = await Promise.all([getBoardJobs(ws), getUnassignedJobs()]);
    if (assignRes.success && assignRes.data) store.setJobs(assignRes.data as WorkBoardJob[]);
    if (unassignedRes.success && unassignedRes.data) store.setUnassigned(unassignedRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0], unassignedRes.data.inspections as Parameters<typeof store.setUnassigned>[1]);
  }, [store, view, selectedDate, updateUrl]);

  const handlePrevWeek = () => { const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() - 7); loadWeekData(toLocalDateString(d)); };
  const handleNextWeek = () => { const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 7); loadWeekData(toLocalDateString(d)); };
  const handleToday = () => { setSelectedDate(toLocalDateString(new Date())); loadWeekData(getWeekStartDate(new Date(), boardSettings.weekStartDay)); };
  const handlePrevDay = () => { const d = new Date(selectedDate + "T12:00:00"); d.setDate(d.getDate() - 1); const nd = toLocalDateString(d); setSelectedDate(nd); const nw = getWeekStartDate(d, boardSettings.weekStartDay); if (nw !== weekStart) loadWeekData(nw); };
  const handleNextDay = () => { const d = new Date(selectedDate + "T12:00:00"); d.setDate(d.getDate() + 1); const nd = toLocalDateString(d); setSelectedDate(nd); const nw = getWeekStartDate(d, boardSettings.weekStartDay); if (nw !== weekStart) loadWeekData(nw); };

  const handleCreateWorkOrder = async (techId: string, startTime: string, endTime: string) => {
    setBoardContext({ boardTech: techId, boardDate: selectedDate, boardStart: startTime, boardEnd: endTime });
    const [vehiclesResult, customersResult] = await Promise.all([getVehicles(), getCustomersList()]);
    setVehiclePickerVehicles(vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data.map((v) => ({ id: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate, customer: v.customer })) : []);
    setVehiclePickerCustomers(customersResult.success && customersResult.data ? customersResult.data : []);
    setVehiclePickerOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.job && data.job.type) setActiveDrag({ id: event.active.id as string, job: data.job });
    else if (data?.job && data?.type) setActiveDrag({ id: event.active.id as string, unassignedJob: { job: data.job, type: data.type as "serviceRecord" | "inspection" } });
    else setActiveDrag({ id: event.active.id as string });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const overData = over.data.current as { technicianId: string; date: string } | undefined;
    if (!overData?.technicianId) return;
    const activeData = active.data.current;

    if (activeData?.job && activeData.job.type) {
      const job = activeData.job as WorkBoardJob;
      if (job.technicianId === overData.technicianId) return;
      store.optimisticMove(job.id, overData.technicianId);
      const res = await moveJob({ id: job.id, technicianId: overData.technicianId, sortOrder: 0, type: job.type });
      if (!res.success) { toast.error(t("failedMove"), { description: res.error }); store.optimisticMove(job.id, job.technicianId!); }
      else if (res.data) store.updateJob(res.data as WorkBoardJob);
      return;
    }

    if (activeData?.job && activeData?.type) {
      const job = activeData.job;
      const jobType = activeData.type as "serviceRecord" | "inspection";
      // Set default time on the drop target's date (1 hour block at work day start)
      const dropDate = overData.date || selectedDate;
      const startDateTime = new Date(dropDate + "T" + boardSettings.workDayStart + ":00");
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
      store.removeFromUnassigned(job.id, jobType);
      const res = await assignTechnician({ id: job.id, technicianId: overData.technicianId, type: jobType, startDateTime, endDateTime });
      if (!res.success) { toast.error(t("failedAssign"), { description: res.error }); store.addToUnassigned(job, jobType); }
      else if (res.data) store.addJob(res.data as WorkBoardJob);
    }
  };

  const handleRemoveJob = async (job: WorkBoardJob) => {
    setPopoverOpen(false); setSelectedJob(null);
    store.removeJob(job.id);
    const res = await unassignJob({ id: job.id, type: job.type });
    if (!res.success) { toast.error(t("failedRemove"), { description: res.error }); store.addJob(job); }
    else { const unRes = await getUnassignedJobs(); if (unRes.success && unRes.data) store.setUnassigned(unRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0], unRes.data.inspections as Parameters<typeof store.setUnassigned>[1]); }
  };

  const handleCardClick = (a: WorkBoardJob) => { setSelectedJob(a); setPopoverOpen(true); };

  if (store.technicians.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <WorkBoardToolbar weekStart={weekStart} selectedDate={selectedDate} view={view} onPrevWeek={handlePrevWeek} onNextWeek={handleNextWeek} onPrevDay={handlePrevDay} onNextDay={handleNextDay} onToday={handleToday} onAddTech={() => setTechDialogOpen(true)} onViewChange={setView} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <Users className="h-12 w-12 text-muted-foreground/40" />
          <div className="text-center"><h3 className="text-lg font-medium">{t("noTechnicians")}</h3><p className="text-sm text-muted-foreground">{t("noTechniciansDescription")}</p></div>
        </div>
        <TechnicianDialog open={techDialogOpen} onOpenChange={setTechDialogOpen} />
      </div>
    );
  }

  const dragOverlay = activeDrag?.job ? (
    <div className="w-48 opacity-90"><BoardJobCard job={activeDrag.job} /></div>
  ) : activeDrag?.unassignedJob ? (
    <div className="w-48 opacity-90"><UnassignedJobOverlayCard job={activeDrag.unassignedJob.job} type={activeDrag.unassignedJob.type} /></div>
  ) : null;

  const gridTemplateColumns = `140px ${days
    .map((d) =>
      d === toLocalDateString(new Date()) ? "minmax(0,2fr)" : "minmax(0,1fr)",
    )
    .join(" ")}`;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <WorkBoardToolbar weekStart={weekStart} selectedDate={selectedDate} view={view} onPrevWeek={handlePrevWeek} onNextWeek={handleNextWeek} onPrevDay={handlePrevDay} onNextDay={handleNextDay} onToday={handleToday} onAddTech={() => { setEditingTech(null); setTechDialogOpen(true); }} onViewChange={setView} />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-hidden">
          <ScrollArea className="flex-1">
            {view === "day" ? (
              <DayTimeline date={selectedDate} technicians={store.technicians} assignments={store.jobs} workDayStart={boardSettings.workDayStart} workDayEnd={boardSettings.workDayEnd} onCardClick={handleCardClick} onTechClick={(t) => { setEditingTech(t); setTechDialogOpen(true); }} onCreateWorkOrder={handleCreateWorkOrder} />
            ) : (
              <div className="min-w-[900px] grid gap-1" style={{ gridTemplateColumns }}>
                <div />
                {days.map((day) => {
                  const isToday = day === toLocalDateString(new Date());
                  const d = new Date(day + "T12:00:00");
                  const dayKey = ALL_DAY_KEYS[d.getDay()];
                  return <div key={day} className={`rounded-md px-2 py-1 text-center text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t(`days.${dayKey}`)} {d.getDate()}</div>;
                })}
                {store.technicians.map((tech) => (
                  <TechnicianRow key={tech.id} technician={tech} days={days} assignments={store.jobs} onCardClick={handleCardClick} onTechClick={(t) => { setEditingTech(t); setTechDialogOpen(true); }} />
                ))}
              </div>
            )}
          </ScrollArea>
          <UnassignedJobsPanel />
        </div>
        <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
      </DndContext>

      {selectedJob && (
        <JobDetailPopover job={selectedJob} open={popoverOpen} onOpenChange={(o) => { setPopoverOpen(o); if (!o) setSelectedJob(null); }} onRemove={() => handleRemoveJob(selectedJob)} />
      )}
      <TechnicianDialog open={techDialogOpen} onOpenChange={setTechDialogOpen} technician={editingTech} />
      <VehiclePickerDialog open={vehiclePickerOpen} onOpenChange={(open) => { setVehiclePickerOpen(open); if (!open) setBoardContext({}); }} vehicles={vehiclePickerVehicles} customers={vehiclePickerCustomers} redirectQuery={boardContext} />
    </div>
  );
}
