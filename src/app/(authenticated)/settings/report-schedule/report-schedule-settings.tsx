"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Loader2,
  CalendarClock,
  Clock,
  Send,
  Trash2,
  Users,
  Plus,
  Pencil,
  X,
  ChevronsUpDown,
} from "lucide-react";
import {
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  toggleReportSchedule,
  sendReportNow,
} from "@/features/report-schedule/Actions/reportScheduleActions";
import { REPORT_SECTIONS, DATE_RANGES } from "@/features/report-schedule/Schema/reportScheduleSchema";
import type { ReportSection } from "@/features/report-schedule/Schema/reportScheduleSchema";

interface Schedule {
  id: string;
  name: string;
  frequency: string;
  dateRange: string;
  sections: string[];
  recipients: string[];
  nextRunDate: Date;
  endDate: Date | null;
  isActive: boolean;
  lastRunAt: Date | null;
  runCount: number;
}

interface Member {
  id: string;
  name: string;
  email: string;
}

interface Props {
  schedules: Schedule[];
  members: Member[];
}

// --------------- Recipient Picker ---------------

function RecipientPicker({
  members,
  selected,
  onAdd,
  onRemove,
}: {
  members: Member[];
  selected: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("settings.reportSchedule");
  const [open, setOpen] = useState(false);

  const available = members.filter((m) => !selected.includes(m.id));
  const selectedMembers = selected
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as Member[];

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between font-normal"
          >
            {t("addRecipient")}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("searchMembers")} />
            <CommandList>
              <CommandEmpty>{t("noMembers")}</CommandEmpty>
              {available.map((member) => (
                <CommandItem
                  key={member.id}
                  value={`${member.name} ${member.email}`}
                  onSelect={() => {
                    onAdd(member.id);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedMembers.length > 0 && (
        <div className="space-y-1.5">
          {selectedMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(member.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------- Schedule Form (used in dialog) ---------------

function ScheduleForm({
  schedule,
  members,
  onClose,
}: {
  schedule: Schedule | null;
  members: Member[];
  onClose: () => void;
}) {
  const t = useTranslations("settings.reportSchedule");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(schedule?.name || "");
  const [frequency, setFrequency] = useState(schedule?.frequency || "weekly");
  const [dateRange, setDateRange] = useState(schedule?.dateRange || "last30d");
  const [sections, setSections] = useState<string[]>(
    schedule?.sections || [...REPORT_SECTIONS],
  );
  const [recipients, setRecipients] = useState<string[]>(
    schedule?.recipients || [],
  );
  const [endDate, setEndDate] = useState(
    schedule?.endDate
      ? new Date(schedule.endDate).toISOString().split("T")[0]
      : "",
  );

  const toggleSection = (section: string) => {
    setSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section],
    );
  };

  const toggleRecipient = (userId: string) => {
    setRecipients((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const sectionLabels: Record<ReportSection, string> = {
    revenue: t("sectionLabels.revenue"),
    tax: t("sectionLabels.tax"),
    pastDue: t("sectionLabels.pastDue"),
    services: t("sectionLabels.services"),
    customers: t("sectionLabels.customers"),
    technicians: t("sectionLabels.technicians"),
    parts: t("sectionLabels.parts"),
    jobAnalytics: t("sectionLabels.jobAnalytics"),
    retention: t("sectionLabels.retention"),
    inventory: t("sectionLabels.inventory"),
  };

  const handleSave = () => {
    startTransition(async () => {
      const payload = {
        name: name || undefined,
        frequency,
        dateRange,
        sections,
        recipients,
        endDate: endDate || null,
      };

      const result = schedule
        ? await updateReportSchedule({ ...payload, id: schedule.id })
        : await createReportSchedule(payload);

      if (result.success) {
        toast.success(schedule ? t("updated") : t("created"));
        router.refresh();
        onClose();
      } else {
        toast.error(result.error || "Failed to save");
      }
    });
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      {/* Name & Frequency */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="schedule-name">{t("name")}</Label>
          <Input
            id="schedule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{t("frequency")}</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t("daily")}</SelectItem>
                <SelectItem value="weekly">{t("weekly")}</SelectItem>
                <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                <SelectItem value="monthly">{t("monthly")}</SelectItem>
                <SelectItem value="bimonthly">{t("bimonthly")}</SelectItem>
                <SelectItem value="quarterly">{t("quarterly")}</SelectItem>
                <SelectItem value="semiannually">{t("semiannually")}</SelectItem>
                <SelectItem value="yearly">{t("yearly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("dateRangeLabel")}</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`dateRanges.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">{t("endDate")}</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Report sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("sections")}</Label>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSections([...REPORT_SECTIONS])}
            >
              {t("selectAll")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSections([])}
            >
              {t("clearAll")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_SECTIONS.map((section) => (
            <label
              key={section}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
            >
              <Checkbox
                checked={sections.includes(section)}
                onCheckedChange={() => toggleSection(section)}
              />
              {sectionLabels[section as ReportSection]}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Recipients */}
      <div className="space-y-3">
        <Label>{t("recipients")}</Label>
        <RecipientPicker
          members={members}
          selected={recipients}
          onAdd={(id) => setRecipients((prev) => [...prev, id])}
          onRemove={(id) => setRecipients((prev) => prev.filter((r) => r !== id))}
        />
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button
          onClick={handleSave}
          disabled={
            isPending || sections.length === 0 || recipients.length === 0
          }
        >
          {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {schedule ? t("save") : t("create")}
        </Button>
      </div>
    </div>
  );
}

// --------------- Schedule Card ---------------

function ScheduleCard({
  schedule,
  members,
  onEdit,
}: {
  schedule: Schedule;
  members: Member[];
  onEdit: () => void;
}) {
  const t = useTranslations("settings.reportSchedule");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSendNow = () => {
    setSending(true);
    startTransition(async () => {
      const result = await sendReportNow(schedule.id);
      if (result.success) {
        toast.success(t("sentNow"));
        router.refresh();
      } else {
        toast.error(result.error || "Failed to send");
      }
      setSending(false);
    });
  };

  const frequencyLabel = (f: string) => {
    const key = ["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(f) ? f : null;
    return key ? t(key) : f;
  };

  const sectionLabels: Record<string, string> = {
    revenue: t("sectionLabels.revenue"),
    tax: t("sectionLabels.tax"),
    pastDue: t("sectionLabels.pastDue"),
    services: t("sectionLabels.services"),
    customers: t("sectionLabels.customers"),
    technicians: t("sectionLabels.technicians"),
    parts: t("sectionLabels.parts"),
    jobAnalytics: t("sectionLabels.jobAnalytics"),
    retention: t("sectionLabels.retention"),
    inventory: t("sectionLabels.inventory"),
  };

  const recipientNames = schedule.recipients
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter(Boolean);

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleReportSchedule(schedule.id);
      if (result.success) {
        toast.success(schedule.isActive ? t("toggledOff") : t("toggledOn"));
        router.refresh();
      } else {
        toast.error(result.error || "Failed to toggle");
      }
    });
  };

  const handleDelete = () => {
    setDeleting(true);
    startTransition(async () => {
      const result = await deleteReportSchedule(schedule.id);
      if (result.success) {
        toast.success(t("deleted"));
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete");
      }
      setDeleting(false);
    });
  };

  return (
    <Card className={!schedule.isActive ? "opacity-60" : undefined}>
      <CardContent className="p-4 space-y-3">
        {/* Top row: name, badge, toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-sm">
                {schedule.name}
              </h3>
              <Badge
                variant={schedule.isActive ? "default" : "secondary"}
                className="shrink-0 text-[10px]"
              >
                {frequencyLabel(schedule.frequency)}
              </Badge>
            </div>
            {/* Sections as small tags */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {schedule.sections.map((s) => (
                <span
                  key={s}
                  className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {sectionLabels[s] || s}
                </span>
              ))}
            </div>
          </div>
          <Switch
            checked={schedule.isActive}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {recipientNames.length > 0
              ? recipientNames.join(", ")
              : `${schedule.recipients.length} recipient${schedule.recipients.length !== 1 ? "s" : ""}`}
          </span>
          {schedule.isActive && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("nextRun")}:{" "}
              {new Date(schedule.nextRunDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {schedule.runCount > 0 && (
            <span className="flex items-center gap-1">
              <Send className="h-3 w-3" />
              {schedule.runCount} {t("sent")}
            </span>
          )}
          {schedule.lastRunAt && (
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {t("lastRun")}:{" "}
              {new Date(schedule.lastRunAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onEdit} disabled={isPending}>
            <Pencil className="mr-1 h-3 w-3" />
            {t("edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSendNow}
            disabled={isPending || sending}
          >
            {sending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1 h-3 w-3" />
            )}
            {t("sendNow")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isPending || deleting}
          >
            {deleting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3 w-3" />
            )}
            {t("delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------- Main Component ---------------

export function ReportScheduleSettings({ schedules, members }: Props) {
  const t = useTranslations("settings.reportSchedule");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const openNew = () => {
    setEditingSchedule(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("newSchedule")}
        </Button>
      </div>

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("emptyDescription")}
            </p>
            <Button size="sm" className="mt-4" onClick={openNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("newSchedule")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              members={members}
              onEdit={() => openEdit(schedule)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? t("editSchedule") : t("newSchedule")}
            </DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <ScheduleForm
              key={editingSchedule?.id || "new"}
              schedule={editingSchedule}
              members={members}
              onClose={() => setDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
