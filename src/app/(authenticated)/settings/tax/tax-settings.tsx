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
import { Loader2, Percent, Save } from "lucide-react";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import {
  applyTaxRateToExisting,
  convertRecordsToInclusive,
} from "@/features/settings/Actions/applyTaxRateToExisting";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function TaxSettings({
  settings,
  taxBackfillCounts,
  inclusiveBackfillCounts,
}: {
  settings: Record<string, string>;
  taxBackfillCounts: { serviceRecords: number; quotes: number };
  inclusiveBackfillCounts: { serviceRecords: number; quotes: number };
}) {
  const router = useRouter();
  const t = useTranslations("settings");
  const confirm = useConfirm();

  const [saving, setSaving] = useState(false);
  const [applyingTax, setApplyingTax] = useState(false);
  const [convertingInclusive, setConvertingInclusive] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(
    settings[SETTING_KEYS.TAX_ENABLED] !== "false",
  );
  const [defaultTaxRate, setDefaultTaxRate] = useState(
    settings[SETTING_KEYS.DEFAULT_TAX_RATE] || "0",
  );
  const [taxInclusive, setTaxInclusive] = useState(
    settings[SETTING_KEYS.TAX_INCLUSIVE] === "true",
  );
  const [taxLabel, setTaxLabel] = useState(
    settings[SETTING_KEYS.TAX_LABEL] || "",
  );

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.TAX_ENABLED]: String(taxEnabled),
      [SETTING_KEYS.DEFAULT_TAX_RATE]: taxEnabled ? defaultTaxRate : "0",
      [SETTING_KEYS.TAX_INCLUSIVE]: String(taxInclusive),
      [SETTING_KEYS.TAX_LABEL]: taxLabel.trim(),
    });
    setSaving(false);
    router.refresh();
    toast.success(t("currency.saved"));
  };

  const handleApplyTaxToExisting = async () => {
    const totalCount =
      taxBackfillCounts.serviceRecords + taxBackfillCounts.quotes;
    if (totalCount === 0) {
      toast.info(t("currency.applyTaxNoRecords"));
      return;
    }
    const ok = await confirm({
      title: t("currency.applyTaxConfirmTitle"),
      description: t("currency.applyTaxConfirmDescription", {
        rate: defaultTaxRate,
        serviceRecords: taxBackfillCounts.serviceRecords,
        quotes: taxBackfillCounts.quotes,
      }),
      confirmLabel: t("currency.applyTaxConfirmLabel"),
    });
    if (!ok) return;

    setApplyingTax(true);
    const result = await applyTaxRateToExisting();
    setApplyingTax(false);

    if (result.success && result.data) {
      toast.success(
        t("currency.applyTaxSuccess", {
          serviceRecords: result.data.serviceRecordsUpdated,
          quotes: result.data.quotesUpdated,
        }),
      );
      router.refresh();
    } else {
      toast.error(result.error || t("currency.applyTaxFailed"));
    }
  };

  const handleConvertToInclusive = async () => {
    const totalCount =
      inclusiveBackfillCounts.serviceRecords + inclusiveBackfillCounts.quotes;
    if (totalCount === 0) {
      toast.info(t("tax.convertInclusiveNoRecords"));
      return;
    }
    const ok = await confirm({
      title: t("tax.convertInclusiveConfirmTitle"),
      description: t("tax.convertInclusiveConfirmDescription", {
        serviceRecords: inclusiveBackfillCounts.serviceRecords,
        quotes: inclusiveBackfillCounts.quotes,
      }),
      confirmLabel: t("tax.convertInclusiveConfirmLabel"),
      destructive: true,
    });
    if (!ok) return;

    setConvertingInclusive(true);
    const result = await convertRecordsToInclusive();
    setConvertingInclusive(false);

    if (result.success && result.data) {
      toast.success(
        t("tax.convertInclusiveSuccess", {
          serviceRecords: result.data.serviceRecordsUpdated,
          quotes: result.data.quotesUpdated,
        }),
      );
      router.refresh();
    } else {
      toast.error(result.error || t("tax.convertInclusiveFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Percent className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t("tax.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("tax.description")}</p>

          <ReadOnlyWrapper>
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>{t("currency.enableTax")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("currency.enableTaxHint")}
                  </p>
                </div>
                <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
              </div>

              {taxEnabled && (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="defaultTaxRate">
                      {t("currency.defaultTaxRate")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("currency.defaultTaxRateHint")}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      id="defaultTaxRate"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={defaultTaxRate}
                      onChange={(e) => setDefaultTaxRate(e.target.value)}
                      className="w-28 pr-8 text-right"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              )}

              {taxEnabled && (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="taxLabel">{t("tax.labelLabel")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("tax.labelHint")}
                    </p>
                  </div>
                  <Input
                    id="taxLabel"
                    type="text"
                    placeholder={t("tax.labelPlaceholder")}
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                    className="w-40"
                  />
                </div>
              )}

              {taxEnabled && (
                <div className="space-y-2">
                  <Label>{t("tax.modeLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("tax.modeHint")}
                  </p>
                  <div className="inline-flex rounded-md border p-0.5">
                    <button
                      type="button"
                      onClick={() => setTaxInclusive(false)}
                      className={cn(
                        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                        !taxInclusive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t("tax.modeExclusive")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxInclusive(true)}
                      className={cn(
                        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                        taxInclusive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t("tax.modeInclusive")}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {taxInclusive
                      ? t("tax.modeInclusiveExample", {
                          rate: defaultTaxRate || "0",
                        })
                      : t("tax.modeExclusiveExample", {
                          rate: defaultTaxRate || "0",
                        })}
                  </p>
                </div>
              )}

              {taxEnabled && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 sm:max-w-xl">
                      <p className="text-sm font-medium">
                        {t("currency.applyTaxToExistingLabel")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("currency.applyTaxToExistingHint", {
                          serviceRecords: taxBackfillCounts.serviceRecords,
                          quotes: taxBackfillCounts.quotes,
                        })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleApplyTaxToExisting}
                      disabled={
                        applyingTax ||
                        Number(defaultTaxRate) <= 0 ||
                        taxBackfillCounts.serviceRecords +
                          taxBackfillCounts.quotes ===
                          0
                      }
                    >
                      {applyingTax ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("currency.applyTaxToExistingButton")}
                    </Button>
                  </div>
                </div>
              )}

              {taxEnabled && taxInclusive && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 sm:max-w-xl">
                      <p className="text-sm font-medium">
                        {t("tax.convertInclusiveLabel")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("tax.convertInclusiveHint", {
                          serviceRecords: inclusiveBackfillCounts.serviceRecords,
                          quotes: inclusiveBackfillCounts.quotes,
                        })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleConvertToInclusive}
                      disabled={
                        convertingInclusive ||
                        inclusiveBackfillCounts.serviceRecords +
                          inclusiveBackfillCounts.quotes ===
                          0
                      }
                    >
                      {convertingInclusive ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("tax.convertInclusiveButton")}
                    </Button>
                  </div>
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
                {t("currency.saveSettings")}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
