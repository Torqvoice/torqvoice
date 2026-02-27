"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, ClipboardCheck, ExternalLink, Trash2 } from "lucide-react";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";
import { useTranslations } from "next-intl";

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

  const detailUrl = isServiceRecord
    ? `/vehicles/${vehicle?.id}/service/${assignment.serviceRecordId}`
    : `/inspections/${assignment.inspectionId}`;

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

          {assignment.notes && (
            <p className="text-sm text-muted-foreground">{assignment.notes}</p>
          )}

          <p className="text-xs text-muted-foreground">
            {t("date", { date: assignment.date })}
          </p>

          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href={detailUrl}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("viewDetails")}
              </Link>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onRemove}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("remove")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
