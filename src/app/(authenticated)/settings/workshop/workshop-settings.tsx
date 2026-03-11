"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Loader2, Ruler, Save, Wrench, CalendarDays, Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTechnician } from "@/features/workboard/Actions/technicianActions";
import { cn } from "@/lib/utils";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

interface TechnicianOption {
  id: string
  name: string
}

export function WorkshopSettings({ settings, technicians: initialTechnicians = [] }: { settings: Record<string, string>; technicians?: TechnicianOption[] }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const [defaultTechnician, setDefaultTechnician] = useState(
    settings[SETTING_KEYS.DEFAULT_TECHNICIAN] || ""
  );
  const [technicians, setTechnicians] = useState<TechnicianOption[]>(initialTechnicians);
  const [techOpen, setTechOpen] = useState(false);
  const [techSearch, setTechSearch] = useState('');
  const [creatingTech, setCreatingTech] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [defaultLaborRate, setDefaultLaborRate] = useState(
    settings[SETTING_KEYS.DEFAULT_LABOR_RATE] || ""
  );
  const [unitSystem, setUnitSystem] = useState(
    settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial"
  );
  const [weekStartDay, setWeekStartDay] = useState(
    settings[SETTING_KEYS.WORKBOARD_WEEK_START_DAY] || "1"
  );
  const [workDayStart, setWorkDayStart] = useState(
    settings[SETTING_KEYS.WORKBOARD_WORK_DAY_START] || "07:00"
  );
  const [workDayEnd, setWorkDayEnd] = useState(
    settings[SETTING_KEYS.WORKBOARD_WORK_DAY_END] || "15:00"
  );

  const handleTechSelect = (techName: string) => {
    setDefaultTechnician(techName);
    setTechOpen(false);
  };

  const doCreateTechnician = async (name: string) => {
    if (!name.trim()) return;
    setCreatingTech(true);
    const res = await createTechnician({ name: name.trim() });
    setCreatingTech(false);
    if (res.success && res.data) {
      const newTech = { id: res.data.id, name: res.data.name };
      setTechnicians((prev) => [...prev, newTech]);
      setTechSearch('');
      setNewTechName('');
      setShowNewInput(false);
      handleTechSelect(newTech.name);
    } else {
      toast.error(t('workshop.failedCreateTech'));
    }
  };

  const searchLower = techSearch.toLowerCase();
  const exactMatch = technicians.some((tech) => tech.name.toLowerCase() === searchLower);

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.DEFAULT_TECHNICIAN]: defaultTechnician,
      [SETTING_KEYS.DEFAULT_LABOR_RATE]: defaultLaborRate,
      [SETTING_KEYS.UNIT_SYSTEM]: unitSystem,
      [SETTING_KEYS.WORKBOARD_WEEK_START_DAY]: weekStartDay,
      [SETTING_KEYS.WORKBOARD_WORK_DAY_START]: workDayStart,
      [SETTING_KEYS.WORKBOARD_WORK_DAY_END]: workDayEnd,
    });
    setSaving(false);
    router.refresh();
    toast.success(t('workshop.saved'));
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('workshop.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('workshop.description')}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('workshop.defaultTechnician')}</Label>
              <Popover open={techOpen} onOpenChange={setTechOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={techOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {defaultTechnician || t('workshop.technicianPlaceholder')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput
                      placeholder={t('workshop.technicianPlaceholder')}
                      value={techSearch}
                      onValueChange={setTechSearch}
                    />
                    <CommandList className="max-h-60 overflow-y-auto">
                      <CommandEmpty className="p-0" />
                      <CommandGroup>
                        {technicians.map((tech) => (
                          <CommandItem
                            key={tech.id}
                            value={tech.name}
                            onSelect={() => handleTechSelect(tech.name)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                defaultTechnician === tech.name ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            {tech.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {techSearch.trim() && !exactMatch && (
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${techSearch}`}
                            onSelect={() => doCreateTechnician(techSearch)}
                            disabled={creatingTech}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {creatingTech ? t('workshop.creating') : t('workshop.createTechnician', { name: techSearch.trim() })}
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandSeparator />
                      <CommandGroup>
                        {showNewInput ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              placeholder={t('workshop.newTechPlaceholder')}
                              value={newTechName}
                              onChange={(e) => setNewTechName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  doCreateTechnician(newTechName);
                                }
                                if (e.key === 'Escape') {
                                  setShowNewInput(false);
                                  setNewTechName('');
                                }
                              }}
                              className="h-7 text-sm"
                              disabled={creatingTech}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 shrink-0"
                              disabled={creatingTech || !newTechName.trim()}
                              onClick={() => doCreateTechnician(newTechName)}
                            >
                              {creatingTech ? t('workshop.creating') : t('workshop.addTech')}
                            </Button>
                          </div>
                        ) : (
                          <CommandItem
                            value="__add_new__"
                            onSelect={() => setShowNewInput(true)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('workshop.addNewTech')}
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultLaborRate">{t('workshop.defaultLaborRate')}</Label>
              <Input
                id="defaultLaborRate"
                type="number"
                placeholder={t('workshop.laborRatePlaceholder')}
                value={defaultLaborRate}
                onChange={(e) => setDefaultLaborRate(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <Ruler className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('workshop.unitsTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('workshop.unitsDescription')}
            </p>

            <div className="space-y-2">
              <Label htmlFor="unitSystem">{t('workshop.unitSystem')}</Label>
              <Select value={unitSystem} onValueChange={setUnitSystem}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">{t('workshop.metric')}</SelectItem>
                  <SelectItem value="imperial">{t('workshop.imperial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              {unitSystem === "metric" ? (
                <div className="space-y-1">
                  <p>{t('workshop.distanceLabel')}: <span className="font-medium text-foreground">{t('workshop.kilometers')}</span></p>
                  <p>{t('workshop.volumeLabel')}: <span className="font-medium text-foreground">{t('workshop.liters')}</span></p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>{t('workshop.distanceLabel')}: <span className="font-medium text-foreground">{t('workshop.miles')}</span></p>
                  <p>{t('workshop.volumeLabel')}: <span className="font-medium text-foreground">{t('workshop.gallons')}</span></p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('workshop.workBoardTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('workshop.workBoardDescription')}
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="weekStartDay">{t('workshop.weekStartDay')}</Label>
                <Select value={weekStartDay} onValueChange={setWeekStartDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t(`workshop.weekDays.${d}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workDayStart">{t('workshop.workDayStart')}</Label>
                <Input
                  id="workDayStart"
                  type="time"
                  value={workDayStart}
                  onChange={(e) => setWorkDayStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workDayEnd">{t('workshop.workDayEnd')}</Label>
                <Input
                  id="workDayEnd"
                  type="time"
                  value={workDayEnd}
                  onChange={(e) => setWorkDayEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('workshop.saveWorkshop')}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
