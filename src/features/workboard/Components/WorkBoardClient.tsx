"use client";

import { useState, useEffect, useCallback } from "react";
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
import { WorkBoardToolbar } from "./WorkBoardToolbar";
import { TechnicianRow } from "./TechnicianRow";
import { UnassignedJobsPanel } from "./UnassignedJobsPanel";
import { TechnicianDialog } from "./TechnicianDialog";
import { JobDetailPopover } from "./JobDetailPopover";
import { BoardJobCard } from "./BoardJobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Wrench, ClipboardCheck } from "lucide-react";

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDayHeader(dateStr: string, index: number) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_LABELS[index]} ${d.getDate()}`;
}

function UnassignedJobOverlayCard({
  job,
  type,
}: {
  job: Record<string, unknown>;
  type: "serviceRecord" | "inspection";
}) {
  const isServiceRecord = type === "serviceRecord";
  const vehicle = job.vehicle as { year: number; make: string; model: string; licensePlate: string | null } | undefined;
  const title = isServiceRecord
    ? (job.title as string)
    : ((job.template as { name: string })?.name ?? "Inspection");

  return (
    <div className="flex items-start gap-1 rounded-md border bg-card p-1.5 text-xs shadow-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {isServiceRecord ? (
            <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
          ) : (
            <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />
          )}
          <span className="truncate font-medium">{title}</span>
        </div>
        {vehicle && (
          <p className="truncate text-muted-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export function WorkBoardClient({
  initialTechnicians,
  initialAssignments,
  initialUnassigned,
  initialWeekStart,
}: {
  initialTechnicians: Technician[];
  initialAssignments: BoardAssignmentWithJob[];
  initialUnassigned: { serviceRecords: unknown[]; inspections: unknown[] };
  initialWeekStart: string;
}) {
  const store = useWorkBoardStore();

  // Initialize store from server data
  useEffect(() => {
    store.setTechnicians(initialTechnicians);
    store.setAssignments(initialAssignments);
    store.setUnassigned(
      initialUnassigned.serviceRecords as Parameters<typeof store.setUnassigned>[0],
      initialUnassigned.inspections as Parameters<typeof store.setUnassigned>[1],
    );
    store.setWeekStart(initialWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useWorkBoardWebSocket();

  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<BoardAssignmentWithJob | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    assignment?: BoardAssignmentWithJob;
    unassignedJob?: { job: Record<string, unknown>; type: "serviceRecord" | "inspection" };
  } | null>(null);

  const weekStart = store.weekStart || initialWeekStart;
  const days = getWeekDays(weekStart);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const loadWeekData = useCallback(async (ws: string) => {
    store.setWeekStart(ws);
    const [assignRes, unassignedRes] = await Promise.all([
      getBoardAssignments(ws),
      getUnassignedJobs(),
    ]);
    if (assignRes.success && assignRes.data) {
      store.setAssignments(assignRes.data as BoardAssignmentWithJob[]);
    }
    if (unassignedRes.success && unassignedRes.data) {
      store.setUnassigned(
        unassignedRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0],
        unassignedRes.data.inspections as Parameters<typeof store.setUnassigned>[1],
      );
    }
  }, [store]);

  const handlePrevWeek = () => {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() - 7);
    loadWeekData(toLocalDateString(d));
  };

  const handleNextWeek = () => {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + 7);
    loadWeekData(toLocalDateString(d));
  };

  const handleToday = () => {
    loadWeekData(getMonday(new Date()));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.assignment) {
      setActiveDrag({ id: active.id as string, assignment: data.assignment });
    } else if (data?.job && data?.type) {
      setActiveDrag({
        id: active.id as string,
        unassignedJob: { job: data.job, type: data.type as "serviceRecord" | "inspection" },
      });
    } else {
      setActiveDrag({ id: active.id as string });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current as
      | { technicianId: string; date: string }
      | undefined;
    if (!overData?.technicianId || !overData?.date) return;

    const activeData = active.data.current;

    // Existing assignment being moved
    if (activeData?.assignment) {
      const assignment = activeData.assignment as BoardAssignmentWithJob;
      // Same position — skip
      if (
        assignment.technicianId === overData.technicianId &&
        assignment.date === overData.date
      ) {
        return;
      }

      // Optimistic update
      store.optimisticMove(assignment.id, overData.technicianId, overData.date);

      const res = await moveAssignment({
        id: assignment.id,
        technicianId: overData.technicianId,
        date: overData.date,
        sortOrder: 0,
      });

      if (!res.success) {
        toast.error("Failed to move assignment", { description: res.error });
        // Revert
        store.optimisticMove(
          assignment.id,
          assignment.technicianId,
          assignment.date,
        );
      } else if (res.data) {
        store.updateAssignment(res.data as BoardAssignmentWithJob);
      }
      return;
    }

    // Unassigned job being dropped on a cell
    if (activeData?.job && activeData?.type) {
      const job = activeData.job;
      const jobType = activeData.type as "serviceRecord" | "inspection";

      const input = {
        date: overData.date,
        technicianId: overData.technicianId,
        ...(jobType === "serviceRecord"
          ? { serviceRecordId: job.id }
          : { inspectionId: job.id }),
      };

      // Optimistic: remove from unassigned
      store.removeFromUnassigned(job.id, jobType);

      const res = await createBoardAssignment(input);
      if (!res.success) {
        toast.error("Failed to assign job", { description: res.error });
        // Revert
        store.addToUnassigned(job, jobType);
      } else if (res.data) {
        store.addAssignment(res.data as BoardAssignmentWithJob);
      }
    }
  };

  const handleRemoveAssignment = async (assignment: BoardAssignmentWithJob) => {
    setPopoverOpen(false);
    setSelectedAssignment(null);

    // Optimistic removal
    store.removeAssignment(assignment.id);

    const res = await removeAssignment({ id: assignment.id });
    if (!res.success) {
      toast.error("Failed to remove assignment", { description: res.error });
      // Re-add on failure
      store.addAssignment(assignment);
    } else {
      // Refresh unassigned list
      const unRes = await getUnassignedJobs();
      if (unRes.success && unRes.data) {
        store.setUnassigned(
          unRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0],
          unRes.data.inspections as Parameters<typeof store.setUnassigned>[1],
        );
      }
    }
  };

  const handleCardClick = (assignment: BoardAssignmentWithJob) => {
    setSelectedAssignment(assignment);
    setPopoverOpen(true);
  };

  if (store.technicians.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <WorkBoardToolbar
          weekStart={weekStart}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          onAddTech={() => setTechDialogOpen(true)}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <Users className="h-12 w-12 text-muted-foreground/40" />
          <div className="text-center">
            <h3 className="text-lg font-medium">No Technicians Yet</h3>
            <p className="text-sm text-muted-foreground">
              Add a technician to start scheduling work on the board.
            </p>
          </div>
        </div>
        <TechnicianDialog
          open={techDialogOpen}
          onOpenChange={setTechDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <WorkBoardToolbar
        weekStart={weekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onAddTech={() => {
          setEditingTech(null);
          setTechDialogOpen(true);
        }}
      />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Main grid */}
          <ScrollArea className="flex-1">
            <div className="min-w-[900px] space-y-1">
              {/* Day headers */}
              <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-1">
                <div />
                {days.map((day, i) => {
                  const isToday = day === toLocalDateString(new Date());
                  return (
                    <div
                      key={day}
                      className={`rounded-md px-2 py-1 text-center text-xs font-medium ${
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDayHeader(day, i)}
                    </div>
                  );
                })}
              </div>

              {/* Technician rows */}
              {store.technicians.map((tech) => (
                <TechnicianRow
                  key={tech.id}
                  technician={tech}
                  days={days}
                  assignments={store.assignments}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Unassigned panel */}
          <UnassignedJobsPanel />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag?.assignment ? (
            <div className="w-48 opacity-90">
              <BoardJobCard assignment={activeDrag.assignment} />
            </div>
          ) : activeDrag?.unassignedJob ? (
            <div className="w-48 opacity-90">
              <UnassignedJobOverlayCard
                job={activeDrag.unassignedJob.job}
                type={activeDrag.unassignedJob.type}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail dialog for selected card */}
      {selectedAssignment && (
        <JobDetailPopover
          assignment={selectedAssignment}
          open={popoverOpen}
          onOpenChange={(o) => {
            setPopoverOpen(o);
            if (!o) setSelectedAssignment(null);
          }}
          onRemove={() => handleRemoveAssignment(selectedAssignment)}
        />
      )}

      <TechnicianDialog
        open={techDialogOpen}
        onOpenChange={setTechDialogOpen}
        technician={editingTech}
      />
    </div>
  );
}
