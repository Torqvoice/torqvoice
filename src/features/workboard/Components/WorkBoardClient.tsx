"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { useWorkBoardStore, type Technician } from "../store/workboardStore";
import { useWorkBoardWebSocket } from "../hooks/useWorkBoardWebSocket";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import {
  getBoardAssignments,
  getUnassignedJobs,
  createBoardAssignment,
  moveAssignment,
  removeAssignment,
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
import { useTranslations, useLocale } from "next-intl";
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
  initialAssignments: BoardAssignmentWithJob[];
  initialUnassigned: { serviceRecords: unknown[]; inspections: unknown[] };
  initialWeekStart: string;
  boardSettings: WorkBoardSettings;
}) {
  const store = useWorkBoardStore();
  const t = useTranslations("workBoard.board");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlView = searchParams.get("view") as BoardView | null;
  const urlDate = searchParams.get("date");
  const urlWeek = searchParams.get("week");

  useEffect(() => {
    store.setTechnicians(initialTechnicians);
    store.setAssignments(initialAssignments);
    store.setUnassigned(initialUnassigned.serviceRecords as Parameters<typeof store.setUnassigned>[0], initialUnassigned.inspections as Parameters<typeof store.setUnassigned>[1]);
    store.setWeekStart(urlWeek || initialWeekStart);
    if (urlWeek && urlWeek !== initialWeekStart) {
      getBoardAssignments(urlWeek).then((res) => { if (res.success && res.data) store.setAssignments(res.data as BoardAssignmentWithJob[]); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useWorkBoardWebSocket();

  const [view, setViewState] = useState<BoardView>(urlView === "day" || urlView === "week" ? urlView : "week");
  const [selectedDate, setSelectedDateState] = useState(urlDate || toLocalDateString(new Date()));
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<BoardAssignmentWithJob | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ id: string; assignment?: BoardAssignmentWithJob; unassignedJob?: { job: Record<string, unknown>; type: "serviceRecord" | "inspection" } } | null>(null);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [vehiclePickerVehicles, setVehiclePickerVehicles] = useState<{ id: string; make: string; model: string; year: number; licensePlate: string | null; customer: { id: string; name: string; company: string | null } | null }[]>([]);
  const [vehiclePickerCustomers, setVehiclePickerCustomers] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [boardContext, setBoardContext] = useState<Record<string, string>>({});

  const weekStart = store.weekStart || initialWeekStart;
  const days = getWeekDays(weekStart);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), useSensor(KeyboardSensor));

  const updateUrl = useCallback((newView: BoardView, newDate: string, newWeekStart: string) => {
    const params = new URLSearchParams(); params.set("view", newView); params.set("date", newDate); params.set("week", newWeekStart);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  const setView = useCallback((v: BoardView) => { setViewState(v); updateUrl(v, selectedDate, weekStart); }, [selectedDate, weekStart, updateUrl]);
  const setSelectedDate = useCallback((d: string) => { setSelectedDateState(d); updateUrl(view, d, weekStart); }, [view, weekStart, updateUrl]);

  const loadWeekData = useCallback(async (ws: string) => {
    store.setWeekStart(ws); updateUrl(view, selectedDate, ws);
    const [assignRes, unassignedRes] = await Promise.all([getBoardAssignments(ws), getUnassignedJobs()]);
    if (assignRes.success && assignRes.data) store.setAssignments(assignRes.data as BoardAssignmentWithJob[]);
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
    if (data?.assignment) setActiveDrag({ id: event.active.id as string, assignment: data.assignment });
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

    if (activeData?.assignment) {
      const assignment = activeData.assignment as BoardAssignmentWithJob;
      if (assignment.technicianId === overData.technicianId) return;
      store.optimisticMove(assignment.id, overData.technicianId);
      const res = await moveAssignment({ id: assignment.id, technicianId: overData.technicianId, sortOrder: 0 });
      if (!res.success) { toast.error(t("failedMove"), { description: res.error }); store.optimisticMove(assignment.id, assignment.technicianId); }
      else if (res.data) store.updateAssignment(res.data as BoardAssignmentWithJob);
      return;
    }

    if (activeData?.job && activeData?.type) {
      const job = activeData.job;
      const jobType = activeData.type as "serviceRecord" | "inspection";
      const input = { technicianId: overData.technicianId, ...(jobType === "serviceRecord" ? { serviceRecordId: job.id } : { inspectionId: job.id }) };
      store.removeFromUnassigned(job.id, jobType);
      const res = await createBoardAssignment(input);
      if (!res.success) { toast.error(t("failedAssign"), { description: res.error }); store.addToUnassigned(job, jobType); }
      else if (res.data) store.addAssignment(res.data as BoardAssignmentWithJob);
    }
  };

  const handleRemoveAssignment = async (assignment: BoardAssignmentWithJob) => {
    setPopoverOpen(false); setSelectedAssignment(null);
    store.removeAssignment(assignment.id);
    const res = await removeAssignment({ id: assignment.id });
    if (!res.success) { toast.error(t("failedRemove"), { description: res.error }); store.addAssignment(assignment); }
    else { const unRes = await getUnassignedJobs(); if (unRes.success && unRes.data) store.setUnassigned(unRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0], unRes.data.inspections as Parameters<typeof store.setUnassigned>[1]); }
  };

  const handleCardClick = (a: BoardAssignmentWithJob) => { setSelectedAssignment(a); setPopoverOpen(true); };

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

  const dragOverlay = activeDrag?.assignment ? (
    <div className="w-48 opacity-90"><BoardJobCard assignment={activeDrag.assignment} /></div>
  ) : activeDrag?.unassignedJob ? (
    <div className="w-48 opacity-90"><UnassignedJobOverlayCard job={activeDrag.unassignedJob.job} type={activeDrag.unassignedJob.type} /></div>
  ) : null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <WorkBoardToolbar weekStart={weekStart} selectedDate={selectedDate} view={view} onPrevWeek={handlePrevWeek} onNextWeek={handleNextWeek} onPrevDay={handlePrevDay} onNextDay={handleNextDay} onToday={handleToday} onAddTech={() => { setEditingTech(null); setTechDialogOpen(true); }} onViewChange={setView} />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-hidden">
          <ScrollArea className="flex-1">
            {view === "day" ? (
              <DayTimeline date={selectedDate} technicians={store.technicians} assignments={store.assignments} workDayStart={boardSettings.workDayStart} workDayEnd={boardSettings.workDayEnd} onCardClick={handleCardClick} onTechClick={(t) => { setEditingTech(t); setTechDialogOpen(true); }} onCreateWorkOrder={handleCreateWorkOrder} />
            ) : (
              <div className="min-w-[900px] grid gap-1" style={{ gridTemplateColumns: `140px ${days.map((d) => (d === toLocalDateString(new Date()) ? "minmax(0,2fr)" : "minmax(0,1fr)")).join(" ")}` }}>
                <div />
                {days.map((day) => {
                  const isToday = day === toLocalDateString(new Date());
                  const d = new Date(day + "T12:00:00");
                  const dayKey = ALL_DAY_KEYS[d.getDay()];
                  return <div key={day} className={`rounded-md px-2 py-1 text-center text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t(`days.${dayKey}`)} {d.getDate()}</div>;
                })}
                {store.technicians.map((tech) => (
                  <TechnicianRow key={tech.id} technician={tech} days={days} assignments={store.assignments} onCardClick={handleCardClick} onTechClick={(t) => { setEditingTech(t); setTechDialogOpen(true); }} />
                ))}
              </div>
            )}
          </ScrollArea>
          <UnassignedJobsPanel />
        </div>
        <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
      </DndContext>

      {selectedAssignment && (
        <JobDetailPopover assignment={selectedAssignment} open={popoverOpen} onOpenChange={(o) => { setPopoverOpen(o); if (!o) setSelectedAssignment(null); }} onRemove={() => handleRemoveAssignment(selectedAssignment)} />
      )}
      <TechnicianDialog open={techDialogOpen} onOpenChange={setTechDialogOpen} technician={editingTech} />
      <VehiclePickerDialog open={vehiclePickerOpen} onOpenChange={(open) => { setVehiclePickerOpen(open); if (!open) setBoardContext({}); }} vehicles={vehiclePickerVehicles} customers={vehiclePickerCustomers} redirectQuery={boardContext} />
    </div>
  );
}
