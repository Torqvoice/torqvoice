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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Coins, Loader2, Save } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

const CURRENCIES = [
  { code: "USD", key: "USD" },
  { code: "EUR", key: "EUR" },
  { code: "GBP", key: "GBP" },
  { code: "NOK", key: "NOK" },
  { code: "SEK", key: "SEK" },
  { code: "DKK", key: "DKK" },
  { code: "CHF", key: "CHF" },
  { code: "CAD", key: "CAD" },
  { code: "AUD", key: "AUD" },
  { code: "NZD", key: "NZD" },
  { code: "JPY", key: "JPY" },
  { code: "CNY", key: "CNY" },
  { code: "INR", key: "INR" },
  { code: "BRL", key: "BRL" },
  { code: "MXN", key: "MXN" },
  { code: "PLN", key: "PLN" },
  { code: "CZK", key: "CZK" },
  { code: "HUF", key: "HUF" },
  { code: "TRY", key: "TRY" },
  { code: "ZAR", key: "ZAR" },
  { code: "KRW", key: "KRW" },
  { code: "SGD", key: "SGD" },
  { code: "HKD", key: "HKD" },
  { code: "THB", key: "THB" },
  { code: "ISK", key: "ISK" },
  { code: "RON", key: "RON" },
  { code: "ILS", key: "ILS" },
  { code: "PHP", key: "PHP" },
  { code: "IDR", key: "IDR" },
  { code: "MYR", key: "MYR" },
  { code: "AED", key: "AED" },
  { code: "SAR", key: "SAR" },
];

export function CurrencySettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const [currencyCode, setCurrencyCode] = useState(settings[SETTING_KEYS.CURRENCY_CODE] || "USD");
  const [taxEnabled, setTaxEnabled] = useState(settings[SETTING_KEYS.TAX_ENABLED] !== "false");
  const [defaultTaxRate, setDefaultTaxRate] = useState(settings[SETTING_KEYS.DEFAULT_TAX_RATE] || "0");
  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.CURRENCY_CODE]: currencyCode,
      [SETTING_KEYS.TAX_ENABLED]: String(taxEnabled),
      [SETTING_KEYS.DEFAULT_TAX_RATE]: taxEnabled ? defaultTaxRate : "0",
    });
    setSaving(false);
    router.refresh();
    toast.success(t('currency.saved'));
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Coins className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('currency.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('currency.description')}
          </p>

          <ReadOnlyWrapper>
          <div className="space-y-6">
          <div className="space-y-2">
            <Label>{t('currency.currencyLabel')}</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} &mdash; {t('currency.currencies.' + c.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('currency.previewLabel', { value: formatCurrency(1234.56, currencyCode) })}
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>{t('currency.enableTax')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('currency.enableTaxHint')}
              </p>
            </div>
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
          </div>

          {taxEnabled && (
            <div className="space-y-2">
              <Label htmlFor="defaultTaxRate">{t('currency.defaultTaxRate')}</Label>
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
                {t('currency.defaultTaxRateHint')}
              </p>
            </div>
          )}

          </div>
          </ReadOnlyWrapper>

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('currency.saveSettings')}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
