"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { toast } from "sonner";
import { createReminder, updateReminder } from "../Actions/reminderActions";
import { Loader2 } from "lucide-react";

interface ReminderData {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueMileage: number | null;
}

interface ReminderFormProps {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: ReminderData;
}

export function ReminderForm({ vehicleId, open, onOpenChange, reminder }: ReminderFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueMileage, setDueMileage] = useState("");

  const isEdit = !!reminder;

  useEffect(() => {
    if (open && reminder) {
      setTitle(reminder.title);
      setDescription(reminder.description || "");
      setDueDate(reminder.dueDate ? new Date(reminder.dueDate).toISOString().split("T")[0] : "");
      setDueMileage(reminder.dueMileage ? String(reminder.dueMileage) : "");
    } else if (open) {
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueMileage("");
    }
  }, [open, reminder]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      vehicleId,
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      dueMileage: dueMileage ? Number(dueMileage) : undefined,
    };

    const result = isEdit
      ? await updateReminder({ ...payload, id: reminder.id })
      : await createReminder(payload);

    if (result.success) {
      toast.success(isEdit ? "Reminder updated" : "Reminder created");
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || `Failed to ${isEdit ? "update" : "create"} reminder`);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Reminder" : "Add Reminder"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">Title *</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Oil Change"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-description">Description</Label>
            <Textarea
              id="reminder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reminder-dueDate">Due Date</Label>
              <Input
                id="reminder-dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-dueMileage">Due Mileage</Label>
              <Input
                id="reminder-dueMileage"
                type="number"
                value={dueMileage}
                onChange={(e) => setDueMileage(e.target.value)}
                placeholder="e.g. 50000"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Reminder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
