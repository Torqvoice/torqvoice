"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/use-format-date";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Bell,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useGlassModal } from "@/components/glass-modal";
import { Loader2 } from "lucide-react";
import {
  toggleReminder,
  deleteReminder,
  createReminder,
  updateReminder,
} from "../Actions/reminderActions";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueMileage: number | null;
  isCompleted: boolean;
  createdAt: Date;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
    mileage: number;
  };
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerName: string | null;
}

interface RemindersPageClientProps {
  reminders: Reminder[];
  vehicles: VehicleOption[];
  unitSystem: "metric" | "imperial";
}

type FilterType = "active" | "completed" | "all";

function getUrgency(r: Reminder): "overdue" | "due-soon" | "normal" {
  if (r.isCompleted) return "normal";
  const now = new Date();
  if (r.dueDate && new Date(r.dueDate) < now) return "overdue";
  if (r.dueDate) {
    const sevenDays = new Date(now);
    sevenDays.setDate(sevenDays.getDate() + 7);
    if (new Date(r.dueDate) <= sevenDays) return "due-soon";
  }
  return "normal";
}

export function RemindersPageClient({ reminders, vehicles, unitSystem }: RemindersPageClientProps) {
  const t = useTranslations("reminders");
  const tv = useTranslations("vehicles.reminders");
  const tc = useTranslations("common.buttons");
  const router = useRouter();
  const modal = useGlassModal();
  const { formatDate } = useFormatDate();
  const distUnit = unitSystem === "metric" ? "km" : "mi";

  const [filter, setFilter] = useState<FilterType>("active");
  const [showForm, setShowForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | undefined>();

  // Form state
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState<Date | undefined>();
  const [formDueMileage, setFormDueMileage] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filtered = reminders.filter((r) => {
    if (filter === "active") return !r.isCompleted;
    if (filter === "completed") return r.isCompleted;
    return true;
  });

  const overdueCount = reminders.filter((r) => !r.isCompleted && getUrgency(r) === "overdue").length;

  const handleToggle = async (id: string) => {
    await toggleReminder(id);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    const result = await deleteReminder(id);
    if (result.success) {
      toast.success(t("deleted"));
      router.refresh();
    } else {
      toast.error(t("deleteError"));
    }
  };

  const openAddForm = () => {
    setEditingReminder(undefined);
    setFormVehicleId("");
    setFormTitle("");
    setFormDescription("");
    setFormDueDate(undefined);
    setFormDueMileage("");
    setShowForm(true);
  };

  const openEditForm = (r: Reminder) => {
    setEditingReminder(r);
    setFormVehicleId(r.vehicle.id);
    setFormTitle(r.title);
    setFormDescription(r.description || "");
    setFormDueDate(r.dueDate ? new Date(r.dueDate) : undefined);
    setFormDueMileage(r.dueMileage ? String(r.dueMileage) : "");
    setShowForm(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVehicleId) return;
    setFormLoading(true);

    const payload = {
      vehicleId: formVehicleId,
      title: formTitle,
      description: formDescription || undefined,
      dueDate: formDueDate ? formDueDate.toISOString().split("T")[0] : undefined,
      dueMileage: formDueMileage ? Number(formDueMileage) : undefined,
    };

    const result = editingReminder
      ? await updateReminder({ ...payload, id: editingReminder.id })
      : await createReminder(payload);

    if (result.success) {
      toast.success(editingReminder ? tv("reminderUpdated") : tv("reminderCreated"));
      setShowForm(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || tv("saveError", { action: editingReminder ? "update" : "create" }));
    }
    setFormLoading(false);
  };

  const selectedVehicle = vehicles.find((v) => v.id === formVehicleId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border p-1">
            {(["active", "completed", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tv(f)}
              </button>
            ))}
          </div>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {overdueCount} {tv("overdue").toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("showing", { count: filtered.length, total: reminders.length })}
          </span>
          <Button size="sm" onClick={openAddForm}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {tv("addReminder")}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {filter === "active"
                ? tv("emptyActive")
                : filter === "completed"
                  ? tv("emptyCompleted")
                  : tv("empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((r) => {
                const urgency = getUrgency(r);
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => handleToggle(r.id)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        r.isCompleted
                          ? "border-primary bg-primary/10"
                          : "border-muted-foreground/40 hover:border-primary"
                      }`}
                    >
                      {r.isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </button>
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span
                        className={`text-sm font-medium ${r.isCompleted ? "line-through text-muted-foreground" : ""}`}
                      >
                        {r.title}
                      </span>
                      {urgency === "overdue" && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                          {tv("overdue")}
                        </Badge>
                      )}
                      {urgency === "due-soon" && (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0 h-4">
                          <Clock className="mr-0.5 h-2.5 w-2.5" />
                          {tv("dueSoon")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        <span
                          className="hover:underline cursor-pointer"
                          onClick={() => router.push(`/vehicles/${r.vehicle.id}`)}
                        >
                          {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                          {r.vehicle.licensePlate && ` · ${r.vehicle.licensePlate}`}
                        </span>
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                      {r.dueDate && (
                        <span>{formatDate(new Date(r.dueDate))}</span>
                      )}
                      {r.dueMileage && (
                        <span>{r.dueMileage.toLocaleString()} {distUnit}</span>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditForm(r)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {tc("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {tc("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Reminder Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReminder ? tv("editTitle") : tv("addTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Vehicle selector */}
            <div className="space-y-2">
              <Label>{t("vehicle")}</Label>
              <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleOpen}
                    className="w-full justify-between font-normal"
                    disabled={!!editingReminder}
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
                        {vehicles.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={`${v.year} ${v.make} ${v.model} ${v.licensePlate || ""} ${v.customerName || ""}`}
                            onSelect={() => {
                              setFormVehicleId(v.id);
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

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={formLoading || !formVehicleId}>
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingReminder ? tc("saveChanges") : tv("addTitle")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
