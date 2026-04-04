"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { toast } from "sonner";
import { createFinding, updateFinding } from "../Actions/findingActions";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface FindingData {
  id: string;
  description: string;
  severity: string;
  status: string;
  notes: string | null;
  serviceRecordId?: string | null;
}

interface FindingFormProps {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding?: FindingData;
  serviceRecordId?: string;
}

export function FindingForm({
  vehicleId,
  open,
  onOpenChange,
  finding,
  serviceRecordId,
}: FindingFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const t = useTranslations("vehicles.findings");
  const tc = useTranslations("common.buttons");
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("needs_work");
  const [notes, setNotes] = useState("");

  const isEdit = !!finding;

  useEffect(() => {
    if (open && finding) {
      setDescription(finding.description);
      setSeverity(finding.severity);
      setNotes(finding.notes || "");
    } else if (open) {
      setDescription("");
      setSeverity("needs_work");
      setNotes("");
    }
  }, [open, finding]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      vehicleId,
      description,
      severity: severity as "needs_work" | "monitor" | "urgent",
      notes: notes || undefined,
      serviceRecordId: serviceRecordId || undefined,
    };

    const result = isEdit
      ? await updateFinding({ ...payload, id: finding.id })
      : await createFinding(payload);

    if (result.success) {
      toast.success(isEdit ? t("findingUpdated") : t("findingCreated"));
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open(
        "error",
        "Error",
        result.error || t("saveError", { action: isEdit ? "update" : "create" })
      );
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="finding-description">{t("descriptionLabel")}</Label>
            <Input
              id="finding-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="finding-severity">{t("severityLabel")}</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger id="finding-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">{t("severity.urgent")}</SelectItem>
                <SelectItem value="needs_work">{t("severity.needs_work")}</SelectItem>
                <SelectItem value="monitor">{t("severity.monitor")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="finding-notes">{t("notesLabel")}</Label>
            <Textarea
              id="finding-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? tc("saveChanges") : t("addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
