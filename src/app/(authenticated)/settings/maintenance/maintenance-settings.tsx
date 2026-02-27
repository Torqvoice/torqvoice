"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Gauge, Loader2, Save } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function MaintenanceSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const unitSystem = settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial";
  const distUnit = unitSystem === "metric" ? "km" : "mi";

  const [enabled, setEnabled] = useState(
    settings[SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED] === "true"
  );
  const [serviceInterval, setServiceInterval] = useState(
    settings[SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL] || "15000"
  );
  const [approachingThreshold, setApproachingThreshold] = useState(
    settings[SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD] || "1000"
  );

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED]: enabled ? "true" : "false",
      [SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL]: serviceInterval,
      [SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD]: approachingThreshold,
    });
    setSaving(false);
    router.refresh();
    toast.success(t('maintenance.saved'));
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-3 pb-4">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('maintenance.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {t('maintenance.description')}
            </p>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance-enabled">{t('maintenance.enablePredicted')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('maintenance.enablePredictedHint')}
                </p>
              </div>
              <Switch
                id="maintenance-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="serviceInterval">{t('maintenance.serviceInterval', { unit: distUnit })}</Label>
                <Input
                  id="serviceInterval"
                  type="number"
                  placeholder="15000"
                  value={serviceInterval}
                  onChange={(e) => setServiceInterval(e.target.value)}
                  disabled={!enabled}
                />
                <p className="text-xs text-muted-foreground">
                  {t('maintenance.serviceIntervalHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approachingThreshold">
                  {t('maintenance.approachingThreshold', { unit: distUnit })}
                </Label>
                <Input
                  id="approachingThreshold"
                  type="number"
                  placeholder="1000"
                  value={approachingThreshold}
                  onChange={(e) => setApproachingThreshold(e.target.value)}
                  disabled={!enabled}
                />
                <p className="text-xs text-muted-foreground">
                  {t('maintenance.approachingThresholdHint')}
                </p>
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
                  {t('maintenance.saveMaintenance')}
                </Button>
              </div>
            </SaveButton>
          </CardContent>
        </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
