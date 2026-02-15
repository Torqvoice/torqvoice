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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Coins, Loader2, Ruler, Save } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "DKK", name: "Danish Krone" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "ZAR", name: "South African Rand" },
  { code: "KRW", name: "South Korean Won" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "ISK", name: "Icelandic Krona" },
  { code: "RON", name: "Romanian Leu" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
];

export function CurrencySettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [currencyCode, setCurrencyCode] = useState(settings[SETTING_KEYS.CURRENCY_CODE] || "USD");
  const [taxEnabled, setTaxEnabled] = useState(settings[SETTING_KEYS.TAX_ENABLED] !== "false");
  const [defaultTaxRate, setDefaultTaxRate] = useState(settings[SETTING_KEYS.DEFAULT_TAX_RATE] || "0");
  const [unitSystem, setUnitSystem] = useState(settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial");

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.CURRENCY_CODE]: currencyCode,
      [SETTING_KEYS.TAX_ENABLED]: String(taxEnabled),
      [SETTING_KEYS.DEFAULT_TAX_RATE]: taxEnabled ? defaultTaxRate : "0",
      [SETTING_KEYS.UNIT_SYSTEM]: unitSystem,
    });
    setSaving(false);
    router.refresh();
    toast.success("Currency settings saved");
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Coins className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Currency & Tax</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Default currency and tax rate used across invoices and service records.
          </p>

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} &mdash; {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Preview: {formatCurrency(1234.56, currencyCode)}
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Tax</Label>
              <p className="text-xs text-muted-foreground">
                Show tax calculation on invoices and service records
              </p>
            </div>
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
          </div>

          {taxEnabled && (
            <div className="space-y-2">
              <Label htmlFor="defaultTaxRate">Default Tax Rate (%)</Label>
              <Input
                id="defaultTaxRate"
                type="number"
                min="0"
                step="0.1"
                placeholder="0"
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Auto-populated when creating new service records
              </p>
            </div>
          )}

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

          <Separator />

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Currency Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
