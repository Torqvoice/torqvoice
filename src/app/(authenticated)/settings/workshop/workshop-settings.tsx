"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Loader2, Save, Wrench } from "lucide-react";

export function WorkshopSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
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

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.DEFAULT_TECHNICIAN]: defaultTechnician,
      [SETTING_KEYS.DEFAULT_LABOR_RATE]: defaultLaborRate,
      [SETTING_KEYS.WORKING_HOURS]: workingHours,
    });
    setSaving(false);
    router.refresh();
    toast.success("Workshop settings saved");
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Workshop Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Default values used when creating new service records.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultTechnician">Default Technician Name</Label>
              <Input
                id="defaultTechnician"
                placeholder="John Smith"
                value={defaultTechnician}
                onChange={(e) => setDefaultTechnician(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultLaborRate">Default Labor Rate (per hour)</Label>
              <Input
                id="defaultLaborRate"
                type="number"
                placeholder="75.00"
                value={defaultLaborRate}
                onChange={(e) => setDefaultLaborRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workingHours">Working Hours</Label>
            <Input
              id="workingHours"
              placeholder="Mon-Fri 8:00 AM - 5:00 PM"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
            />
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Workshop Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
