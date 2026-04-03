"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteFinding, resolveFinding } from "../../Actions/findingActions";
import { FindingForm } from "../FindingForm";

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
  externalOpenForm?: boolean;
  onExternalOpenFormHandled?: () => void;
}

const severityColors: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-500 border-red-500/20",
  needs_work: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  monitor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
  open: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  quoted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export function ServiceFindingsSection({
  vehicleId,
  serviceRecordId,
  findings,
  externalOpenForm,
  onExternalOpenFormHandled,
}: ServiceFindingsSectionProps) {
  const router = useRouter();
  const t = useTranslations("vehicles.findings");
  const [showForm, setShowForm] = useState(false);
  const [editingFinding, setEditingFinding] = useState<Finding | undefined>();
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (externalOpenForm) {
      setEditingFinding(undefined);
      setShowForm(true);
      onExternalOpenFormHandled?.();
    }
  }, [externalOpenForm, onExternalOpenFormHandled]);

  const handleResolve = async (id: string) => {
    setLoading(id);
    const result = await resolveFinding({ id });
    if (result.success) {
      toast.success(t("findingResolved"));
      router.refresh();
    }
    setLoading(null);
  };

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
    <>
      {findings.length > 0 && (
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
              onClick={() => {
                setEditingFinding(undefined);
                setShowForm(true);
              }}
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
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${statusColors[f.status] || ""}`}
                    >
                      {t(`status.${f.status}` as "status.open" | "status.quoted" | "status.resolved")}
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
                    onClick={() => {
                      setEditingFinding(f);
                      setShowForm(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {f.status !== "resolved" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={loading === f.id}
                      onClick={() => handleResolve(f.id)}
                    >
                      {loading === f.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                    </Button>
                  )}
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
      )}

      <FindingForm
        vehicleId={vehicleId}
        serviceRecordId={serviceRecordId}
        open={showForm}
        onOpenChange={setShowForm}
        finding={editingFinding}
      />
    </>
  );
}
