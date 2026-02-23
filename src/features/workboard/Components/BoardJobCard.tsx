"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Wrench, ClipboardCheck } from "lucide-react";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";

export function BoardJobCard({
  assignment,
  onClick,
}: {
  assignment: BoardAssignmentWithJob;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: assignment.id,
      data: { assignment },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }
    : undefined;

  const isServiceRecord = !!assignment.serviceRecordId;
  const vehicle = isServiceRecord
    ? assignment.serviceRecord?.vehicle
    : assignment.inspection?.vehicle;
  const title = isServiceRecord
    ? assignment.serviceRecord?.title
    : assignment.inspection?.template?.name;
  const status = isServiceRecord
    ? assignment.serviceRecord?.status
    : assignment.inspection?.status;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex cursor-pointer items-start gap-1 rounded-md border bg-card p-1.5 text-xs shadow-sm transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <button
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
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
        {status && (
          <span className="inline-block rounded bg-muted px-1 py-0.5 text-[10px] capitalize">
            {status.replace(/_/g, " ")}
          </span>
        )}
      </div>
    </div>
  );
}

export function UnassignedJobCard({
  job,
  type,
}: {
  job:
    | {
        id: string;
        title: string;
        status: string;
        vehicle: {
          id: string;
          make: string;
          model: string;
          year: number;
          licensePlate: string | null;
        };
      }
    | {
        id: string;
        status: string;
        vehicle: {
          id: string;
          make: string;
          model: string;
          year: number;
          licensePlate: string | null;
        };
        template: { name: string };
      };
  type: "serviceRecord" | "inspection";
}) {
  const dragId =
    type === "serviceRecord" ? `unassigned-sr-${job.id}` : `unassigned-insp-${job.id}`;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId,
      data: { job, type },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }
    : undefined;

  const isServiceRecord = type === "serviceRecord";
  const title = isServiceRecord
    ? (job as { title: string }).title
    : (job as { template: { name: string } }).template.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex cursor-grab items-start gap-1 rounded-md border bg-card p-1.5 text-xs shadow-sm touch-none active:cursor-grabbing"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {isServiceRecord ? (
            <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
          ) : (
            <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />
          )}
          <span className="truncate font-medium">{title}</span>
        </div>
        <p className="truncate text-muted-foreground">
          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
          {job.vehicle.licensePlate ? ` · ${job.vehicle.licensePlate}` : ""}
        </p>
      </div>
    </div>
  );
}
