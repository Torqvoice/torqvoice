"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { FileText, Loader2, Save } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";
import { cn } from "@/lib/utils";
import { InvoiceLayoutEditor } from "@/features/settings/Components/InvoiceLayoutEditor";
import { InvoiceLayoutPreview } from "@/features/settings/Components/InvoiceLayoutPreview";
import { saveInvoiceLayoutConfig, saveQuoteLayoutConfig } from "@/features/settings/Actions/invoiceLayoutActions";
import { type InvoiceLayoutConfig, getDefaultInvoiceLayout } from "@/features/settings/Schema/invoiceLayoutSchema";
import { CustomFieldsManager } from "@/features/custom-fields/Components/CustomFieldsManager";

type TabType = "general" | "layout" | "customFields";

interface FieldDef {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  entityType: string;
  options: string | null;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface InvoiceSettingsProps {
  settings: Record<string, string>;
  initialInvoiceLayout?: InvoiceLayoutConfig;
  initialQuoteLayout?: InvoiceLayoutConfig;
  customFields: FieldDef[];
  customFieldsEnabled: boolean;
}

export function InvoiceSettings({
  settings,
  initialInvoiceLayout,
  initialQuoteLayout,
  customFields,
  customFieldsEnabled,
}: InvoiceSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);

  const tab = (searchParams.get("tab") as TabType) || "general";
  const setTab = useCallback((newTab: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newTab === "general") {
      params.delete("tab");
    } else {
      params.set("tab", newTab);
    }
    const qs = params.toString();
    router.replace(`/settings/invoice${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  // General tab state
  const [invoicePrefix, setInvoicePrefix] = useState(settings[SETTING_KEYS.INVOICE_PREFIX] || "{year}-");
  const [invoiceStartNumber, setInvoiceStartNumber] = useState(settings[SETTING_KEYS.INVOICE_START_NUMBER] || "");
  const [dueDays, setDueDays] = useState(settings[SETTING_KEYS.INVOICE_DUE_DAYS] || "14");
  const [footerNote, setFooterNote] = useState(settings[SETTING_KEYS.INVOICE_FOOTER_NOTE] || "");

  // Layout tab state
  const [invoiceLayout, setInvoiceLayout] = useState(initialInvoiceLayout ?? getDefaultInvoiceLayout());
  const [quoteLayout, setQuoteLayout] = useState(initialQuoteLayout ?? getDefaultInvoiceLayout());
  const [layoutDocType, setLayoutDocType] = useState<"invoice" | "quote">("invoice");

  // Template values from saved settings
  const invoiceTemplate = {
    primaryColor: settings[SETTING_KEYS.INVOICE_PRIMARY_COLOR] || "#d97706",
    fontFamily: settings[SETTING_KEYS.INVOICE_FONT_FAMILY] || "Helvetica",
    headerStyle: settings[SETTING_KEYS.INVOICE_HEADER_STYLE] || "standard",
  };
  const quoteTemplate = {
    primaryColor: settings[SETTING_KEYS.QUOTE_PRIMARY_COLOR] || invoiceTemplate.primaryColor,
    fontFamily: settings[SETTING_KEYS.QUOTE_FONT_FAMILY] || invoiceTemplate.fontFamily,
    headerStyle: settings[SETTING_KEYS.QUOTE_HEADER_STYLE] || invoiceTemplate.headerStyle,
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.INVOICE_PREFIX]: invoicePrefix,
      [SETTING_KEYS.INVOICE_START_NUMBER]: invoiceStartNumber,
      [SETTING_KEYS.INVOICE_DUE_DAYS]: dueDays,
      [SETTING_KEYS.INVOICE_FOOTER_NOTE]: footerNote,
    });
    setSaving(false);
    router.refresh();
    toast.success(t('invoice.saved'));
  };

  const handleSaveLayout = async () => {
    setSaving(true);
    try {
      if (layoutDocType === "invoice") {
        await saveInvoiceLayoutConfig(invoiceLayout);
      } else {
        await saveQuoteLayoutConfig(quoteLayout);
      }
      toast.success(t('invoice.layoutSaved'));
    } catch {
      toast.error(t('templates.failedSave'));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('invoice.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {tab === "layout"
            ? t('invoice.layoutDescription')
            : tab === "customFields"
              ? t('customFields.description')
              : t('invoice.description')}
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "general"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('invoice.tabs.general')}
        </button>
        <button
          type="button"
          onClick={() => setTab("layout")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "layout"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('invoice.tabs.layout')}
        </button>
        {customFieldsEnabled && (
          <button
            type="button"
            onClick={() => setTab("customFields")}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === "customFields"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t('invoice.tabs.customFields')}
          </button>
        )}
      </div>

      {tab === "general" ? (
        <ReadOnlyWrapper>
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center gap-3 pb-4">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{t('invoice.tabs.general')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  <Button onClick={handleSaveGeneral} disabled={saving}>
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
      ) : tab === "layout" ? (
        <>
          <ReadOnlyWrapper>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-1 rounded-lg border bg-muted p-1 max-w-xs">
                  <button
                    type="button"
                    onClick={() => setLayoutDocType("invoice")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      layoutDocType === "invoice"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('invoice.layoutDocInvoice')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutDocType("quote")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      layoutDocType === "quote"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('invoice.layoutDocQuote')}
                  </button>
                </div>
                <div className="flex items-center gap-2 mr-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (layoutDocType === "invoice") {
                        setInvoiceLayout(getDefaultInvoiceLayout());
                      } else {
                        setQuoteLayout(getDefaultInvoiceLayout());
                      }
                    }}
                  >
                    {t('invoice.resetLayout')}
                  </Button>
                  <Button onClick={handleSaveLayout} disabled={saving} size="sm">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('invoice.saveLayout')}
                  </Button>
                </div>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <InvoiceLayoutEditor
                  config={layoutDocType === "invoice" ? invoiceLayout : quoteLayout}
                  onChange={layoutDocType === "invoice" ? setInvoiceLayout : setQuoteLayout}
                  documentType={layoutDocType}
                  customFields={customFields}
                />
                <div className="hidden xl:block pr-2">
                  <div className="sticky top-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('invoice.preview')}</p>
                    <InvoiceLayoutPreview
                      config={layoutDocType === "invoice" ? invoiceLayout : quoteLayout}
                      documentType={layoutDocType}
                      customFields={customFields}
                      template={layoutDocType === "invoice" ? invoiceTemplate : quoteTemplate}
                      logoUrl={settings[SETTING_KEYS.COMPANY_LOGO] || undefined}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ReadOnlyWrapper>
          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSaveLayout} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('invoice.saveLayout')}
              </Button>
            </div>
          </SaveButton>
        </>
      ) : (
        <CustomFieldsManager
          initialFields={customFields}
          layoutConfig={layoutDocType === "invoice" ? invoiceLayout : quoteLayout}
        />
      )}
    </div>
  );
}
