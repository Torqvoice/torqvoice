"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VehicleCombobox } from "@/features/quotes/Components/VehicleCombobox";
import { createReminder } from "@/features/vehicles/Actions/reminderActions";

interface NewReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD the reminder falls due on, seeded from the day that was right-clicked */
  defaultDueDate?: string;
  onCreated?: () => void;
}

export function NewReminderDialog({
  open,
  onOpenChange,
  defaultDueDate,
  onCreated,
}: NewReminderDialogProps) {
  const t = useTranslations("calendar.reminderDialog");
  const tc = useTranslations("common.buttons");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed on every open so the day just picked wins over the last one
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setDueDate(defaultDueDate ?? "");
      setVehicleId("");
    }
  }, [open, defaultDueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const result = await createReminder({
      title: title.trim(),
      description: description.trim() || undefined,
      vehicleId: vehicleId || null,
      // Midday keeps the reminder on the day that was picked no matter which
      // side of UTC the workshop sits on
      dueDate: dueDate ? `${dueDate}T12:00:00` : undefined,
      notifyInApp: true,
    });

    if (result.success) {
      toast.success(t("created"));
      onOpenChange(false);
      onCreated?.();
    } else {
      toast.error(result.error || t("createError"));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-reminder-title">{t("titleLabel")}</Label>
            <Input
              id="calendar-reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t("vehicleLabel")}</Label>
            <VehicleCombobox
              value={vehicleId}
              placeholder={t("selectVehicle")}
              noneLabel={t("none")}
              onChange={(id) => setVehicleId(id)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-reminder-due">{t("dueDateLabel")}</Label>
            <DateInput
              id="calendar-reminder-due"
              value={dueDate}
              onChange={setDueDate}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-reminder-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="calendar-reminder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
