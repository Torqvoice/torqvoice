"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { setSetting } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { templatePresets } from "@/features/settings/Schema/templatePresets";
import { Check, Loader2, Palette, MessageSquare, RotateCcw } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";
import { cn } from "@/lib/utils";
import { TemplateListClient } from "@/features/inspections/Components/TemplateListClient";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceLayoutPreview } from "@/features/settings/Components/InvoiceLayoutPreview";
import { type InvoiceLayoutConfig, getDefaultInvoiceLayout } from "@/features/settings/Schema/invoiceLayoutSchema";

interface TemplateValues {
  primaryColor: string;
  fontFamily: string;
  headerStyle: string;
}

type TabType = "invoice" | "quotation" | "inspections" | "sms";

const fontMap: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  "Times-Roman": "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

const colorPresets = [
  { key: "amber", value: "#d97706" },
  { key: "blue", value: "#2563eb" },
  { key: "emerald", value: "#059669" },
  { key: "red", value: "#dc2626" },
  { key: "purple", value: "#7c3aed" },
  { key: "slate", value: "#475569" },
  { key: "rose", value: "#e11d48" },
  { key: "indigo", value: "#4f46e5" },
];

function TemplateTab({
  values,
  setValues,
  documentLabel,
  logoUrl,
  invoiceLayoutConfig,
}: {
  values: TemplateValues;
  setValues: (v: TemplateValues) => void;
  documentLabel: string;
  logoUrl?: string;
  invoiceLayoutConfig?: InvoiceLayoutConfig;
}) {
  const t = useTranslations('settings');
  const currentPresetId = templatePresets.find(
    (p) =>
      p.primaryColor === values.primaryColor &&
      p.fontFamily === values.fontFamily &&
      p.headerStyle === values.headerStyle
  )?.id;

  const applyPreset = (presetId: string) => {
    const preset = templatePresets.find((p) => p.id === presetId);
    if (preset) {
      setValues({
        primaryColor: preset.primaryColor,
        fontFamily: preset.fontFamily,
        headerStyle: preset.headerStyle,
      });
    }
  };

  return (
    <>
      {/* Template Gallery */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('templates.presets')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {templatePresets.map((preset) => {
              const isSelected = currentPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`group relative rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
                    isSelected
                      ? "border-primary shadow-sm"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  )}

                  {/* Mini preview */}
                  <div className="mb-2 overflow-hidden rounded border bg-white p-2">
                    <div
                      className="mb-1"
                      style={
                        preset.headerStyle === "modern"
                          ? {
                              backgroundColor: preset.primaryColor,
                              borderRadius: 2,
                              padding: "3px 4px",
                            }
                          : preset.headerStyle === "compact"
                            ? {
                                borderBottom: `1px solid #e5e7eb`,
                                paddingBottom: 2,
                              }
                            : {
                                borderBottom: `2px solid ${preset.primaryColor}`,
                                paddingBottom: 2,
                              }
                      }
                    >
                      <div
                        className="text-[6px] font-bold"
                        style={{
                          color:
                            preset.headerStyle === "modern"
                              ? "white"
                              : preset.primaryColor,
                          fontFamily: fontMap[preset.fontFamily] || "sans-serif",
                        }}
                      >
                        Workshop
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="h-1 w-3/4 rounded-full bg-gray-200" />
                      <div className="h-1 w-1/2 rounded-full bg-gray-200" />
                      <div
                        className="mt-1 h-1.5 w-full rounded-sm"
                        style={{ backgroundColor: `${preset.primaryColor}20` }}
                      />
                      <div className="h-1 w-full rounded-full bg-gray-100" />
                      <div className="h-1 w-full rounded-full bg-gray-100" />
                    </div>
                  </div>

                  <p className="text-xs font-medium">{preset.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Color Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" /> {t('templates.primaryColor')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={values.primaryColor}
                onChange={(e) => setValues({ ...values, primaryColor: e.target.value })}
                className="h-10 w-14 cursor-pointer p-1"
              />
              <Input
                value={values.primaryColor}
                onChange={(e) => setValues({ ...values, primaryColor: e.target.value })}
                className="flex-1 font-mono"
                placeholder="#d97706"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setValues({ ...values, primaryColor: preset.value })}
                  className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted"
                  style={{ borderColor: values.primaryColor === preset.value ? preset.value : undefined }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: preset.value }}
                  />
                  {t('templates.colorPresets.' + preset.key)}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Font & Layout Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('templates.fontAndLayout')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('templates.fontFamily')}</Label>
              <Select
                value={values.fontFamily}
                onValueChange={(v) => setValues({ ...values, fontFamily: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">{t('templates.helveticaDefault')}</SelectItem>
                  <SelectItem value="Times-Roman">{t('templates.timesRoman')}</SelectItem>
                  <SelectItem value="Courier">{t('templates.courier')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('templates.headerStyle')}</Label>
              <Select
                value={values.headerStyle}
                onValueChange={(v) => setValues({ ...values, headerStyle: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t('templates.standard')}</SelectItem>
                  <SelectItem value="compact">{t('templates.compact')}</SelectItem>
                  <SelectItem value="modern">{t('templates.modern')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('templates.preview', { name: documentLabel })}</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceLayoutPreview
            config={invoiceLayoutConfig ?? getDefaultInvoiceLayout()}
            documentType="invoice"
            template={values}
            logoUrl={logoUrl}
          />
        </CardContent>
      </Card>
    </>
  );
}

const smsTemplateFields = [
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
    labelKey: "invoiceReady",
    descriptionKey: "invoiceReadyDescription",
    defaultKey: "invoiceReady",
    variables: ["{share_link}", "{company_name}", "{customer_name}", "{current_user}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
    labelKey: "quoteReady",
    descriptionKey: "quoteReadyDescription",
    defaultKey: "quoteReady",
    variables: ["{share_link}", "{company_name}", "{customer_name}", "{current_user}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
    labelKey: "inspectionReady",
    descriptionKey: "inspectionReadyDescription",
    defaultKey: "inspectionReady",
    variables: ["{share_link}", "{company_name}", "{customer_name}", "{current_user}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
    labelKey: "statusInProgress",
    descriptionKey: "statusInProgressDescription",
    defaultKey: "statusInProgress",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
    labelKey: "statusWaitingParts",
    descriptionKey: "statusWaitingPartsDescription",
    defaultKey: "statusWaitingParts",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
    labelKey: "statusReady",
    descriptionKey: "statusReadyDescription",
    defaultKey: "statusReady",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
    labelKey: "statusCompleted",
    descriptionKey: "statusCompletedDescription",
    defaultKey: "statusCompleted",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
    labelKey: "paymentReceived",
    descriptionKey: "paymentReceivedDescription",
    defaultKey: "paymentReceived",
    variables: ["{amount}", "{invoice_number}", "{company_name}", "{customer_name}", "{current_user}"],
  },
];

function SmsTemplateTab({
  values,
  setValues,
}: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const t = useTranslations('settings');
  const handleReset = (key: string) => {
    const field = smsTemplateFields.find((f) => f.key === key);
    const defaultVal = field ? t.raw(`templates.smsDefaults.${field.defaultKey}`) : "";
    setValues({ ...values, [key]: defaultVal });
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> {t('templates.smsTemplates')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t.rich('templates.smsTemplatesDescription', {
              code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 text-xs">{chunks}</code>,
            })}
          </p>
          <div className="space-y-6">
            {smsTemplateFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t('templates.' + field.labelKey)}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => handleReset(field.key)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {t('templates.reset')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('templates.' + field.descriptionKey)}</p>
                <Textarea
                  value={values[field.key] || ""}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  rows={2}
                  className="resize-none font-mono text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {field.variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(v);
                        toast.success(`Copied ${v}`);
                      }}
                      className="cursor-pointer rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                      title={`Click to copy ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface InspectionTemplateSection {
  id: string;
  name: string;
  sortOrder: number;
  items: { id: string; name: string; sortOrder: number }[];
}

interface InspectionTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sections: InspectionTemplateSection[];
}

export function TemplateSettings({
  initialInvoiceValues,
  initialQuoteValues,
  inspectionTemplates = [],
  smsEnabled = false,
  initialSmsTemplates = {},
  logoUrl,
  invoiceLayoutConfig,
}: {
  initialInvoiceValues: TemplateValues;
  initialQuoteValues: TemplateValues;
  inspectionTemplates?: InspectionTemplate[];
  smsEnabled?: boolean;
  initialSmsTemplates?: Record<string, string>;
  logoUrl?: string;
  invoiceLayoutConfig?: InvoiceLayoutConfig;
}) {
  const t = useTranslations('settings');
  const [tab, setTab] = useState<TabType>("invoice");
  const [saving, setSaving] = useState(false);
  const [invoiceValues, setInvoiceValues] = useState(initialInvoiceValues);
  const [quoteValues, setQuoteValues] = useState(initialQuoteValues);
  const [smsValues, setSmsValues] = useState<Record<string, string>>(initialSmsTemplates);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === "invoice") {
        await Promise.all([
          setSetting(SETTING_KEYS.INVOICE_PRIMARY_COLOR, invoiceValues.primaryColor),
          setSetting(SETTING_KEYS.INVOICE_FONT_FAMILY, invoiceValues.fontFamily),
          setSetting(SETTING_KEYS.INVOICE_HEADER_STYLE, invoiceValues.headerStyle),
        ]);
        toast.success(t('templates.invoiceTemplateSaved'));
      } else if (tab === "quotation") {
        await Promise.all([
          setSetting(SETTING_KEYS.QUOTE_PRIMARY_COLOR, quoteValues.primaryColor),
          setSetting(SETTING_KEYS.QUOTE_FONT_FAMILY, quoteValues.fontFamily),
          setSetting(SETTING_KEYS.QUOTE_HEADER_STYLE, quoteValues.headerStyle),
        ]);
        toast.success(t('templates.quotationTemplateSaved'));
      } else if (tab === "sms") {
        await Promise.all(
          Object.entries(smsValues).map(([key, value]) =>
            setSetting(key as Parameters<typeof setSetting>[0], value),
          ),
        );
        toast.success(t('templates.smsTemplateSaved'));
      }
    } catch {
      toast.error(t('templates.failedSave'));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('templates.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {tab === "inspections"
            ? t('templates.inspectionsDescription')
            : tab === "sms"
              ? t('templates.smsDescription')
              : t('templates.invoiceDescription')}
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("invoice")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "invoice"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('templates.tabs.invoice')}
        </button>
        <button
          type="button"
          onClick={() => setTab("quotation")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "quotation"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('templates.tabs.quotation')}
        </button>
        <button
          type="button"
          onClick={() => setTab("inspections")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "inspections"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('templates.tabs.inspections')}
        </button>
        {smsEnabled && (
          <button
            type="button"
            onClick={() => setTab("sms")}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === "sms"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t('templates.tabs.sms')}
          </button>
        )}
      </div>

      {tab === "inspections" ? (
        <TemplateListClient templates={inspectionTemplates} />
      ) : tab === "sms" ? (
        <>
          <ReadOnlyWrapper>
            <SmsTemplateTab values={smsValues} setValues={setSmsValues} />
          </ReadOnlyWrapper>
          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('templates.saveSmsTemplates')}
              </Button>
            </div>
          </SaveButton>
        </>
      ) : (
        <>
          <ReadOnlyWrapper>
            {tab === "invoice" ? (
              <TemplateTab
                values={invoiceValues}
                setValues={setInvoiceValues}
                documentLabel={t('templates.tabs.invoice')}
                logoUrl={logoUrl}
                invoiceLayoutConfig={invoiceLayoutConfig}
              />
            ) : (
              <TemplateTab
                values={quoteValues}
                setValues={setQuoteValues}
                documentLabel={t('templates.tabs.quotation')}
                logoUrl={logoUrl}
                invoiceLayoutConfig={invoiceLayoutConfig}
              />
            )}
          </ReadOnlyWrapper>

          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t(tab === "invoice" ? 'templates.saveInvoiceTemplate' : 'templates.saveQuotationTemplate')}
              </Button>
            </div>
          </SaveButton>
        </>
      )}
    </div>
  );
}
