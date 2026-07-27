"use client";

import { useState } from "react";
import Link from "next/link";
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
import { runLowStockCheck } from "@/features/inventory/Actions/runLowStockCheck";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Loader2, PackageSearch, PlayCircle, Save } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

/**
 * Alert preferences.
 *
 * Each alert type is a self-contained card owning its own state and save, so
 * adding another (overdue invoices, expiring warranties, upcoming reminders)
 * means dropping in a sibling card rather than reworking this page.
 */
export function AlertsSettings({ settings }: { settings: Record<string, string> }) {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t("alerts.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("alerts.description")}</p>
      </div>
      <ReadOnlyWrapper>
        <div className="space-y-6">
          <LowStockAlertCard settings={settings} />
        </div>
      </ReadOnlyWrapper>
    </div>
  );
}

function LowStockAlertCard({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const [enabled, setEnabled] = useState(
    settings[SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED] === "true",
  );
  const [inApp, setInApp] = useState(
    settings[SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP] !== "false",
  );
  const [email, setEmail] = useState(
    settings[SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL] === "true",
  );
  const [interval, setInterval] = useState(
    settings[SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS] || "24",
  );
  const [defaultThreshold, setDefaultThreshold] = useState(
    settings[SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD] || "0",
  );

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED]: enabled ? "true" : "false",
      [SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP]: inApp ? "true" : "false",
      [SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL]: email ? "true" : "false",
      [SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS]: String(
        Math.max(0, Number(interval) || 24),
      ),
      [SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD]: String(
        Math.max(0, Number(defaultThreshold) || 0),
      ),
    });
    setSaving(false);
    router.refresh();
    toast.success(t("alerts.lowStock.saved"));
  };

  // Runs the same evaluation the schedule does, so the operator can confirm
  // the setup works instead of waiting for the next sweep.
  const handleCheckNow = async () => {
    setChecking(true);
    const result = await runLowStockCheck();
    setChecking(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? t("alerts.lowStock.checkFailed"));
      return;
    }
    if (!result.data.enabled) {
      toast.error(t("alerts.lowStock.checkDisabled"));
      return;
    }
    if (result.data.alerted === 0) {
      toast.success(t("alerts.lowStock.checkNothingNew"));
    } else {
      toast.success(
        t("alerts.lowStock.checkAlerted", { count: result.data.alerted }),
      );
      router.refresh();
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <PackageSearch className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t("alerts.lowStock.title")}</CardTitle>
        </div>
        <a
          href="https://torqvoice.com/docs/features/low-stock-alerts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("alerts.lowStock.readMore")} →
        </a>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {t("alerts.lowStock.description")}
        </p>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="lowStockEnabled">{t("alerts.lowStock.enable")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("alerts.lowStock.enableHint")}
            </p>
          </div>
          <Switch id="lowStockEnabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            <Separator />

            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">
                {t("alerts.lowStock.defaultThreshold")}
              </Label>
              <Input
                id="lowStockThreshold"
                type="number"
                min="0"
                value={defaultThreshold}
                onChange={(e) => setDefaultThreshold(e.target.value)}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">
                {t("alerts.lowStock.defaultThresholdHint")}
              </p>
              {/* At 0 nothing org-wide is watched, so point at where the
                  per-part value actually lives instead of leaving the operator
                  to work it out. */}
              {Number(defaultThreshold) === 0 && (
                <p className="text-xs text-muted-foreground">
                  <Link href="/inventory" className="text-primary hover:underline">
                    {t("alerts.lowStock.configurePerPart")}
                  </Link>
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="lowStockInApp">{t("alerts.lowStock.inApp")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("alerts.lowStock.inAppHint")}
                </p>
              </div>
              <Switch id="lowStockInApp" checked={inApp} onCheckedChange={setInApp} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="lowStockEmail">{t("alerts.lowStock.email")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("alerts.lowStock.emailHint")}
                </p>
              </div>
              <Switch id="lowStockEmail" checked={email} onCheckedChange={setEmail} />
            </div>

            {email && (
              <div className="space-y-2">
                <Label htmlFor="lowStockInterval">
                  {t("alerts.lowStock.emailInterval")}
                </Label>
                <Input
                  id="lowStockInterval"
                  type="number"
                  min="0"
                  max="168"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="max-w-[160px]"
                />
                <p className="text-xs text-muted-foreground">
                  {t("alerts.lowStock.emailIntervalHint")}
                </p>
              </div>
            )}
          </>
        )}

        <SaveButton>
          <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("alerts.lowStock.save")}
          </Button>
          {enabled && (
            <Button variant="outline" onClick={handleCheckNow} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              {t("alerts.lowStock.checkNow")}
            </Button>
          )}
          </div>
        </SaveButton>
      </CardContent>
    </Card>
  );
}
