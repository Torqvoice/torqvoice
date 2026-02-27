"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { FileText, Loader2, Save } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function InvoiceSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const [invoicePrefix, setInvoicePrefix] = useState(settings[SETTING_KEYS.INVOICE_PREFIX] || "{year}-");
  const [invoiceStartNumber, setInvoiceStartNumber] = useState(settings[SETTING_KEYS.INVOICE_START_NUMBER] || "");
  const [dueDays, setDueDays] = useState(settings[SETTING_KEYS.INVOICE_DUE_DAYS] || "14");
  const [showBankAccount, setShowBankAccount] = useState(settings[SETTING_KEYS.INVOICE_SHOW_BANK_ACCOUNT] === "true");
  const [showOrgNumber, setShowOrgNumber] = useState(settings[SETTING_KEYS.INVOICE_SHOW_ORG_NUMBER] === "true");
  const [showLogo, setShowLogo] = useState(settings[SETTING_KEYS.INVOICE_SHOW_LOGO] !== "false");
  const [showCompanyName, setShowCompanyName] = useState(settings[SETTING_KEYS.INVOICE_SHOW_COMPANY_NAME] !== "false");
  const [footerNote, setFooterNote] = useState(settings[SETTING_KEYS.INVOICE_FOOTER_NOTE] || "");

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.INVOICE_PREFIX]: invoicePrefix,
      [SETTING_KEYS.INVOICE_START_NUMBER]: invoiceStartNumber,
      [SETTING_KEYS.INVOICE_DUE_DAYS]: dueDays,
      [SETTING_KEYS.INVOICE_SHOW_BANK_ACCOUNT]: showBankAccount ? "true" : "false",
      [SETTING_KEYS.INVOICE_SHOW_ORG_NUMBER]: showOrgNumber ? "true" : "false",
      [SETTING_KEYS.INVOICE_SHOW_LOGO]: showLogo ? "true" : "false",
      [SETTING_KEYS.INVOICE_SHOW_COMPANY_NAME]: showCompanyName ? "true" : "false",
      [SETTING_KEYS.INVOICE_FOOTER_NOTE]: footerNote,
    });
    setSaving(false);
    router.refresh();
    toast.success(t('invoice.saved'));
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('invoice.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('invoice.description')}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">{t('invoice.invoiceNumberFormat')}</Label>
              <Input
                id="invoicePrefix"
                placeholder="{year}-"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t.rich('invoice.invoiceNumberFormatHint', {
                  code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
                  bold: (chunks) => <span className="font-medium">{chunks}</span>,
                  year: '{year}',
                  preview: invoicePrefix.replace(/\{year\}/g, String(new Date().getFullYear())) + (invoiceStartNumber || '1001'),
                })}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceStartNumber">{t('invoice.nextInvoiceNumber')}</Label>
              <Input
                id="invoiceStartNumber"
                type="number"
                min="1"
                placeholder={t('invoice.nextInvoiceNumberPlaceholder')}
                value={invoiceStartNumber}
                onChange={(e) => setInvoiceStartNumber(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                {t('invoice.nextInvoiceNumberHint', { example: invoicePrefix + (invoiceStartNumber || '...') })}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDays">{t('invoice.dueDays')}</Label>
              <Input
                id="dueDays"
                type="number"
                min="0"
                placeholder="14"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                {t('invoice.dueDaysHint')}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-medium">{t('invoice.visibilityTitle')}</h3>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t('invoice.companyLogo')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('invoice.companyLogoHint')}
                </p>
              </div>
              <Switch
                checked={showLogo}
                onCheckedChange={setShowLogo}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t('invoice.companyName')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('invoice.companyNameHint')}
                </p>
              </div>
              <Switch
                checked={showCompanyName}
                onCheckedChange={setShowCompanyName}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t('invoice.bankAccount')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('invoice.bankAccountHint')}
                </p>
              </div>
              <Switch
                checked={showBankAccount}
                onCheckedChange={setShowBankAccount}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t('invoice.organizationNumber')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('invoice.organizationNumberHint')}
                </p>
              </div>
              <Switch
                checked={showOrgNumber}
                onCheckedChange={setShowOrgNumber}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="footerNote">{t('invoice.customFooter')}</Label>
            <Textarea
              id="footerNote"
              placeholder={t('invoice.footerPlaceholder')}
              rows={2}
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('invoice.footerHint')}
            </p>
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
                {t('invoice.saveInvoice')}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
