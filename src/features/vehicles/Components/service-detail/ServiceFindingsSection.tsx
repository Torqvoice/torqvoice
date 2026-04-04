"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteFinding } from "../../Actions/findingActions";

interface Finding {
  id: string;
  description: string;
  severity: string;
  status: string;
  notes: string | null;
}

interface ServiceFindingsSectionProps {
  vehicleId: string;
  serviceRecordId: string;
  findings: Finding[];
  onAddFinding?: () => void;
  onEditFinding?: (finding: Finding) => void;
}

const severityColors: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-500 border-red-500/20",
  needs_work: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  monitor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

export const ServiceFindingsSection = React.memo(function ServiceFindingsSection({
  findings,
  onAddFinding,
  onEditFinding,
}: ServiceFindingsSectionProps) {
  const router = useRouter();
  const t = useTranslations("vehicles.findings");
  const [loading, setLoading] = useState<string | null>(null);

  if (findings.length === 0) return null;

  const handleDelete = async (id: string) => {
    setLoading(id);
    const result = await deleteFinding(id);
    if (result.success) {
      toast.success(t("findingDeleted"));
      router.refresh();
    }
    setLoading(null);
  };

  const openCount = findings.filter((f) => f.status === "open").length;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">{t("sectionTitle")}</h3>
          {openCount > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">
              {openCount}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onAddFinding?.()}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addFinding")}
        </Button>
      </div>

      <div className="space-y-1.5">
        {findings.map((f) => (
          <div
            key={f.id}
            className="flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${severityColors[f.severity] || ""}`}
                >
                  {t(`severity.${f.severity}` as "severity.urgent" | "severity.needs_work" | "severity.monitor")}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm">{f.description}</p>
              {f.notes && (
                <p className="mt-0.5 text-xs text-muted-foreground">{f.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onEditFinding?.(f)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                disabled={loading === f.id}
                onClick={() => handleDelete(f.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
