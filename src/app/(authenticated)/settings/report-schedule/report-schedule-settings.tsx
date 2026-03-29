"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Loader2,
  CalendarClock,
  Clock,
  Send,
  Trash2,
  Users,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  toggleReportSchedule,
} from "@/features/report-schedule/Actions/reportScheduleActions";
import { REPORT_SECTIONS } from "@/features/report-schedule/Schema/reportScheduleSchema";
import type { ReportSection } from "@/features/report-schedule/Schema/reportScheduleSchema";

interface Schedule {
  id: string;
  name: string;
  frequency: string;
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
  schedule: Schedule | null;
  members: Member[];
}

export function ReportScheduleSettings({ schedule, members }: Props) {
  const t = useTranslations("settings.reportSchedule");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(schedule?.name || "");
  const [frequency, setFrequency] = useState(schedule?.frequency || "weekly");
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

  const selectAllSections = () => setSections([...REPORT_SECTIONS]);
  const clearAllSections = () => setSections([]);

  const handleSave = () => {
    startTransition(async () => {
      const payload = {
        name: name || undefined,
        frequency,
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
      } else {
        toast.error(result.error || "Failed to save");
      }
    });
  };

  const handleDelete = () => {
    if (!schedule) return;
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

  const handleToggle = () => {
    if (!schedule) return;
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

  const frequencyLabel = (f: string) => {
    switch (f) {
      case "daily":
        return t("daily");
      case "weekly":
        return t("weekly");
      case "monthly":
        return t("monthly");
      default:
        return f;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Status card (only shown for existing schedule) */}
      {schedule && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={schedule.isActive}
                  onCheckedChange={handleToggle}
                  disabled={isPending}
                />
                <span className="text-sm font-medium">
                  {schedule.isActive ? t("enabled") : t("disabled")}
                </span>
              </div>
              <Badge variant={schedule.isActive ? "default" : "secondary"}>
                {frequencyLabel(schedule.frequency)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {t("nextRun")}:{" "}
                  <span className="font-medium text-foreground">
                    {schedule.isActive
                      ? new Date(schedule.nextRunDate).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : "—"}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                <span>
                  {t("runCount")}:{" "}
                  <span className="font-medium text-foreground">
                    {schedule.runCount}
                  </span>
                </span>
              </div>
              {schedule.lastRunAt && (
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span>
                    {t("lastRun")}:{" "}
                    <span className="font-medium text-foreground">
                      {new Date(schedule.lastRunAt).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: Schedule config */}
        <div className="space-y-6">
          {/* Name & Frequency */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4" />
                {t("schedule")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-name">{t("name")}</Label>
                <Input
                  id="schedule-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("frequency")}</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("daily")}</SelectItem>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("monthly")}</SelectItem>
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
                <p className="text-xs text-muted-foreground">
                  {t("endDateDescription")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Report sections */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <LayoutGrid className="h-4 w-4" />
                  {t("sections")}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={selectAllSections}
                  >
                    {t("selectAll")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearAllSections}
                  >
                    {t("clearAll")}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("sectionsDescription")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {REPORT_SECTIONS.map((section) => (
                  <label
                    key={section}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      checked={sections.includes(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <span className="text-sm">
                      {sectionLabels[section as ReportSection]}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recipients */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" />
                {t("recipients")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("recipientsDescription")}
              </p>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("noMembers")}
                </p>
              ) : (
                <div className="space-y-1">
                  {members.map((member) => (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={recipients.includes(member.id)}
                        onCheckedChange={() => toggleRecipient(member.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("frequency")}</span>
                  <span className="font-medium">
                    {frequencyLabel(frequency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("sectionsIncluded")}
                  </span>
                  <span className="font-medium">
                    {sections.length} / {REPORT_SECTIONS.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("recipientsCount")}
                  </span>
                  <span className="font-medium">{recipients.length}</span>
                </div>
                {endDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("endDate")}</span>
                    <span className="font-medium">
                      {new Date(endDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          {schedule && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending || deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("delete")}
            </Button>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={
            isPending || sections.length === 0 || recipients.length === 0
          }
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : schedule ? null : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {schedule ? t("save") : t("create")}
        </Button>
      </div>
    </div>
  );
}
