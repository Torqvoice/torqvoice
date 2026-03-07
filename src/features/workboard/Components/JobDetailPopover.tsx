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
import type { WorkBoardJob } from "../Actions/boardActions";
import { updateServiceTimes, updateInspectionTimes } from "../Actions/boardActions";
import { useWorkBoardStore } from "../store/workboardStore";
import { DurationPicker } from "./DurationSlider";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getJobDateRange } from "../utils/datetime";

export function JobDetailPopover({
  job,
  open,
  onOpenChange,
  onRemove,
}: {
  job: WorkBoardJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("workBoard.jobDetail");
  const store = useWorkBoardStore();

  const liveJob =
    store.jobs.find((j) => j.id === job.id) ?? job;

  const { start: initStart, end: initEnd } = getJobDateRange(liveJob);
  const [startDate, setStartDate] = useState<Date | undefined>(initStart ?? undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(initEnd ?? undefined);

  useEffect(() => {
    const { start, end } = getJobDateRange(liveJob);
    setStartDate(start ?? undefined);
    setEndDate(end ?? undefined);
  }, [liveJob.id, liveJob.startDateTime, liveJob.endDateTime]);

  const isServiceRecord = liveJob.type === "serviceRecord";

  const detailUrl = isServiceRecord
    ? `/vehicles/${liveJob.vehicle?.id}/service/${liveJob.id}`
    : `/inspections/${liveJob.id}`;

  const saveTimes = useCallback(
    async (start: Date | undefined, end: Date | undefined) => {
      if (!start || !end) return;
      if (end <= start) {
        toast.error(t("endBeforeStart"));
        return;
      }

      store.updateServiceTimes(
        job.id,
        start.toISOString(),
        end.toISOString(),
      );

      const action = isServiceRecord ? updateServiceTimes : updateInspectionTimes;
      const res = await action({
        id: job.id,
        startDateTime: start,
        endDateTime: end,
      });
      if (!res.success) {
        const { start: origStart, end: origEnd } = getJobDateRange(job);
        if (origStart && origEnd) {
          store.updateServiceTimes(job.id, origStart.toISOString(), origEnd.toISOString());
        }
        toast.error(t("failedTimes"));
      }
    },
    [job, store, t, isServiceRecord],
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
            {liveJob.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {liveJob.vehicle && (
            <p className="text-sm text-muted-foreground">
              {liveJob.vehicle.year} {liveJob.vehicle.make} {liveJob.vehicle.model}
              {liveJob.vehicle.licensePlate ? ` · ${liveJob.vehicle.licensePlate}` : ""}
            </p>
          )}

          {liveJob.status && (
            <Badge variant="secondary" className="capitalize">
              {liveJob.status.replace(/_/g, " ")}
            </Badge>
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
