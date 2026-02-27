"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Loader2, Ruler, Save, Wrench } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function WorkshopSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const [defaultTechnician, setDefaultTechnician] = useState(
    settings[SETTING_KEYS.DEFAULT_TECHNICIAN] || ""
  );
  const [defaultLaborRate, setDefaultLaborRate] = useState(
    settings[SETTING_KEYS.DEFAULT_LABOR_RATE] || ""
  );
  const [workingHours, setWorkingHours] = useState(
    settings[SETTING_KEYS.WORKING_HOURS] || ""
  );
  const [unitSystem, setUnitSystem] = useState(
    settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial"
  );

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.DEFAULT_TECHNICIAN]: defaultTechnician,
      [SETTING_KEYS.DEFAULT_LABOR_RATE]: defaultLaborRate,
      [SETTING_KEYS.WORKING_HOURS]: workingHours,
      [SETTING_KEYS.UNIT_SYSTEM]: unitSystem,
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
              <Label htmlFor="defaultTechnician">{t('workshop.defaultTechnician')}</Label>
              <Input
                id="defaultTechnician"
                placeholder={t('workshop.technicianPlaceholder')}
                value={defaultTechnician}
                onChange={(e) => setDefaultTechnician(e.target.value)}
              />
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

          <div className="space-y-2">
            <Label htmlFor="workingHours">{t('workshop.workingHours')}</Label>
            <Input
              id="workingHours"
              placeholder={t('workshop.workingHoursPlaceholder')}
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
            />
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
