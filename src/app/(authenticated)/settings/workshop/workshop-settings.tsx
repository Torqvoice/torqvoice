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
    toast.success("Workshop settings saved");
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
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

          <div className="space-y-4">
            <div className="flex flex-row items-center gap-3">
              <Ruler className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Units</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose between metric (km, liters) and imperial (miles, gallons) units.
            </p>

            <div className="space-y-2">
              <Label htmlFor="unitSystem">Unit System</Label>
              <Select value={unitSystem} onValueChange={setUnitSystem}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Metric (km, liters)</SelectItem>
                  <SelectItem value="imperial">Imperial (miles, gallons)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              {unitSystem === "metric" ? (
                <div className="space-y-1">
                  <p>Distance: <span className="font-medium text-foreground">kilometers (km)</span></p>
                  <p>Volume: <span className="font-medium text-foreground">liters (L)</span></p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>Distance: <span className="font-medium text-foreground">miles (mi)</span></p>
                  <p>Volume: <span className="font-medium text-foreground">gallons (gal)</span></p>
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
                Save Workshop Settings
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
