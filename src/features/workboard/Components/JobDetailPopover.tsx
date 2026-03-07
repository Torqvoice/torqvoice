"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Wrench, ClipboardCheck, ExternalLink, Trash2 } from "lucide-react";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import { updateServiceTimes, updateInspectionTimes } from "../Actions/boardActions";
import { useWorkBoardStore } from "../store/workboardStore";
import { DurationPicker } from "./DurationSlider";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getAssignmentDateRange } from "../utils/datetime";

export function JobDetailPopover({
  assignment,
  open,
  onOpenChange,
  onRemove,
}: {
  assignment: BoardAssignmentWithJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("workBoard.jobDetail");
  const store = useWorkBoardStore();

  const liveAssignment =
    store.assignments.find((a) => a.id === assignment.id) ?? assignment;

  const { start: initStart, end: initEnd } = getAssignmentDateRange(liveAssignment);
  const [startDate, setStartDate] = useState<Date | undefined>(initStart ?? undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(initEnd ?? undefined);

  useEffect(() => {
    const { start, end } = getAssignmentDateRange(liveAssignment);
    setStartDate(start ?? undefined);
    setEndDate(end ?? undefined);
  }, [liveAssignment.id, liveAssignment.serviceRecord?.startDateTime, liveAssignment.serviceRecord?.endDateTime, liveAssignment.inspection?.startDateTime, liveAssignment.inspection?.endDateTime]);

  const isServiceRecord = !!liveAssignment.serviceRecordId;
  const vehicle = isServiceRecord
    ? liveAssignment.serviceRecord?.vehicle
    : liveAssignment.inspection?.vehicle;
  const title = isServiceRecord
    ? liveAssignment.serviceRecord?.title
    : liveAssignment.inspection?.template?.name;
  const status = isServiceRecord
    ? liveAssignment.serviceRecord?.status
    : liveAssignment.inspection?.status;

  const detailUrl = isServiceRecord
    ? `/vehicles/${vehicle?.id}/service/${liveAssignment.serviceRecordId}`
    : `/inspections/${liveAssignment.inspectionId}`;

  const recordId = isServiceRecord
    ? liveAssignment.serviceRecordId!
    : liveAssignment.inspectionId!;

  const saveTimes = useCallback(
    async (start: Date | undefined, end: Date | undefined) => {
      if (!start || !end) return;
      if (end <= start) {
        toast.error(t("endBeforeStart"));
        return;
      }

      store.updateServiceTimes(
        assignment.id,
        start.toISOString(),
        end.toISOString(),
      );

      const action = isServiceRecord ? updateServiceTimes : updateInspectionTimes;
      const res = await action({
        id: recordId,
        startDateTime: start,
        endDateTime: end,
      });
      if (!res.success) {
        const { start: origStart, end: origEnd } = getAssignmentDateRange(assignment);
        if (origStart && origEnd) {
          store.updateServiceTimes(assignment.id, origStart.toISOString(), origEnd.toISOString());
        }
        toast.error(t("failedTimes"));
      }
    },
    [assignment, store, t, isServiceRecord, recordId],
  );

  const handleDurationChange = (hours: number | null) => {
    if (hours && startDate) {
      const newEnd = new Date(startDate.getTime() + hours * 3600000);
      setEndDate(newEnd);
      saveTimes(startDate, newEnd);
    }
  };

  const currentHours = startDate && endDate
    ? Math.round((endDate.getTime() - startDate.getTime()) / 3600000)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isServiceRecord ? (
              <Wrench className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <ClipboardCheck className="h-4 w-4 shrink-0 text-green-500" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {vehicle && (
            <p className="text-sm text-muted-foreground">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
            </p>
          )}

          {status && (
            <Badge variant="secondary" className="capitalize">
              {status.replace(/_/g, " ")}
            </Badge>
          )}

          {liveAssignment.notes && (
            <p className="text-sm text-muted-foreground">{liveAssignment.notes}</p>
          )}

          <DurationPicker
            value={currentHours}
            onChange={handleDurationChange}
          />

          <div className="space-y-1.5">
            <Label className="text-xs">{t("startTime")}</Label>
            <DateTimePicker
              value={startDate}
              onChange={(d) => {
                setStartDate(d);
                const newEnd = d ? new Date(d.getTime() + 3600000) : endDate;
                setEndDate(newEnd);
                saveTimes(d, newEnd);
              }}
              granularity="minute"
              hourCycle={24}
              placeholder={t("startTime")}
              displayFormat={{ hour24: "PPP HH:mm" }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("endTime")}</Label>
            <DateTimePicker
              value={endDate}
              onChange={(d) => {
                setEndDate(d);
                saveTimes(startDate, d);
              }}
              granularity="minute"
              hourCycle={24}
              placeholder={t("endTime")}
              displayFormat={{ hour24: "PPP HH:mm" }}
            />
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href={detailUrl}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("viewDetails")}
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={onRemove}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("remove")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
