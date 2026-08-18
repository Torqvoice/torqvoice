"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { CustomerCombobox } from "@/features/quotes/Components/CustomerCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocsLink } from "@/components/docs-link";
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useGlassModal } from "@/components/glass-modal";
import { createReminder, updateReminder } from "../Actions/reminderActions";

export interface ReminderFormVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerName: string | null;
  customerId: string | null;
}

export interface ReminderFormValues {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueMileage: number | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  customer: { id: string; name: string } | null;
  vehicle: { id: string } | null;
}

interface ReminderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: ReminderFormVehicle[];
  /** Set to edit an existing reminder; left out, the dialog creates a new one */
  reminder?: ReminderFormValues;
  /** Seeds the due date of a new reminder, e.g. the calendar day that was right-clicked */
  defaultDueDate?: Date;
  onSaved?: () => void;
}

/** YYYY-MM-DD from the local calendar day, never the UTC one */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ReminderFormDialog({
  open,
  onOpenChange,
  vehicles,
  reminder,
  defaultDueDate,
  onSaved,
}: ReminderFormDialogProps) {
  const t = useTranslations("reminders");
  const tv = useTranslations("vehicles.reminders");
  const tc = useTranslations("common.buttons");
  const modal = useGlassModal();

  const [formVehicleId, setFormVehicleId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState<Date | undefined>();
  const [formDueMileage, setFormDueMileage] = useState("");
  const [formNotifyInApp, setFormNotifyInApp] = useState(true);
  const [formNotifyEmail, setFormNotifyEmail] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formCustomer, setFormCustomer] = useState<{ id: string; name: string; company: string | null } | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isEdit = !!reminder;

  // Re-seed on every open so the last session's values never leak in
  useEffect(() => {
    if (!open) return;
    if (reminder) {
      setFormVehicleId(reminder.vehicle?.id ?? "");
      setFormTitle(reminder.title);
      setFormDescription(reminder.description || "");
      setFormDueDate(reminder.dueDate ? new Date(reminder.dueDate) : undefined);
      setFormDueMileage(reminder.dueMileage ? String(reminder.dueMileage) : "");
      setFormNotifyInApp(reminder.notifyInApp ?? true);
      setFormNotifyEmail(reminder.notifyEmail ?? false);
      setFormCustomerId(reminder.customer?.id ?? "");
      setFormCustomer(reminder.customer ? { ...reminder.customer, company: null } : null);
    } else {
      setFormVehicleId("");
      setFormTitle("");
      setFormDescription("");
      setFormDueDate(defaultDueDate);
      setFormDueMileage("");
      setFormNotifyInApp(true);
      setFormNotifyEmail(false);
      setFormCustomerId("");
      setFormCustomer(null);
    }
  }, [open, reminder, defaultDueDate]);

  const selectedVehicle = vehicles.find((v) => v.id === formVehicleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const payload = {
      vehicleId: formVehicleId || null,
      customerId: formCustomerId || null,
      title: formTitle,
      description: formDescription || undefined,
      // Midday on the local day, so the reminder stays on the day that was
      // picked whichever side of UTC the workshop sits on
      dueDate: formDueDate ? `${toLocalDateStr(formDueDate)}T12:00:00` : undefined,
      dueMileage: formDueMileage ? Number(formDueMileage) : undefined,
      notifyInApp: formNotifyInApp,
      notifyEmail: formNotifyEmail,
    };

    const result = reminder
      ? await updateReminder({ ...payload, id: reminder.id })
      : await createReminder(payload);

    if (result.success) {
      toast.success(isEdit ? tv("reminderUpdated") : tv("reminderCreated"));
      onOpenChange(false);
      onSaved?.();
    } else {
      modal.open("error", "Error", result.error || tv("saveError"));
    }
    setFormLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? tv("editTitle") : tv("addTitle")}</DialogTitle>
          <DocsLink href="/docs/features/reminders" variant="hint" className="self-start" />
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target: workshop (nothing), customer, or vehicle */}
          <div className="space-y-2">
            <Label>{t("relatesTo")}</Label>
            <CustomerCombobox
              value={formCustomerId}
              initialCustomer={formCustomer}
              placeholder={t("selectCustomer")}
              noneLabel={t("noneOption")}
              onChange={(id) => {
                setFormCustomerId(id);
                // A vehicle belonging to another customer no longer fits
                const current = vehicles.find((v) => v.id === formVehicleId);
                if (id && current && current.customerId !== id) {
                  setFormVehicleId("");
                }
              }}
            />
            <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={vehicleOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedVehicle
                    ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.licensePlate ? ` · ${selectedVehicle.licensePlate}` : ""}`
                    : t("selectVehicle")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder={t("searchVehicle")} />
                  <CommandList>
                    <CommandEmpty>{t("noVehicle")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          setFormVehicleId("");
                          setVehicleOpen(false);
                        }}
                      >
                        <Check
                          className={cn("mr-2 h-4 w-4", !formVehicleId ? "opacity-100" : "opacity-0")}
                        />
                        {t("noneOption")}
                      </CommandItem>
                      {vehicles
                        .filter((v) => !formCustomerId || v.customerId === formCustomerId)
                        .map((v) => (
                        <CommandItem
                          key={v.id}
                          value={`${v.year} ${v.make} ${v.model} ${v.licensePlate || ""} ${v.customerName || ""}`}
                          onSelect={() => {
                            setFormVehicleId(v.id);
                            // The vehicle's customer follows automatically
                            if (v.customerId) {
                              setFormCustomerId(v.customerId);
                              setFormCustomer({ id: v.customerId, name: v.customerName || "", company: null });
                            }
                            setVehicleOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formVehicleId === v.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div>
                            <p className="text-sm">
                              {v.year} {v.make} {v.model}
                              {v.licensePlate && <span className="ml-1.5 text-muted-foreground">· {v.licensePlate}</span>}
                            </p>
                            {v.customerName && (
                              <p className="text-xs text-muted-foreground">{v.customerName}</p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {!formVehicleId && !formCustomerId && (
              <p className="text-xs text-muted-foreground">{t("workshopHint")}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="reminder-title">{tv("titleLabel")}</Label>
            <Input
              id="reminder-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={tv("titlePlaceholder")}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="reminder-desc">{tv("descriptionLabel")}</Label>
            <Textarea
              id="reminder-desc"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder={tv("descriptionPlaceholder")}
              rows={2}
            />
          </div>

          {/* Due date + mileage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tv("dueDateLabel")}</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formDueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formDueDate ? format(formDueDate, "PPP") : t("pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formDueDate}
                    onSelect={(date) => {
                      setFormDueDate(date);
                      setCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-mileage">{tv("dueMileageLabel")}</Label>
              <Input
                id="reminder-mileage"
                type="number"
                value={formDueMileage}
                onChange={(e) => setFormDueMileage(e.target.value)}
                placeholder={tv("dueMileagePlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{tv("notifyLabel")}</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={formNotifyInApp}
                  onCheckedChange={(v) => setFormNotifyInApp(v === true)}
                />
                {tv("notifyInApp")}
              </label>
              <label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={formNotifyEmail}
                  onCheckedChange={(v) => setFormNotifyEmail(v === true)}
                />
                {tv("notifyEmail")}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={formLoading}>
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? tc("saveChanges") : tv("addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
