"use client";

import { useState } from "react";
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
import { SMS_TEMPLATE_DEFAULTS } from "@/lib/sms-templates";

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
  { name: "Amber", value: "#d97706" },
  { name: "Blue", value: "#2563eb" },
  { name: "Emerald", value: "#059669" },
  { name: "Red", value: "#dc2626" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Slate", value: "#475569" },
  { name: "Rose", value: "#e11d48" },
  { name: "Indigo", value: "#4f46e5" },
];

function PreviewHeader({
  values,
  headerStyle,
  fontFamily,
  documentLabel,
}: {
  values: TemplateValues;
  headerStyle: string;
  fontFamily: string;
  documentLabel: string;
}) {
  const style = { fontFamily: fontMap[fontFamily] || "sans-serif" };
  const docNumber = documentLabel === "QUOTE" ? "QT-1001" : "INV-1001";

  if (headerStyle === "compact") {
    return (
      <div style={style}>
        <div
          className="flex items-center justify-between"
          style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: values.primaryColor }}
            >
              L
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: values.primaryColor }}>
                Your Workshop Name
              </p>
              <p className="text-[9px] text-gray-500">123 Main Street, City</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">{documentLabel}</p>
            <p className="text-[9px] text-gray-500">{docNumber}</p>
          </div>
        </div>
      </div>
    );
  }

  if (headerStyle === "modern") {
    return (
      <div style={style}>
        <div
          className="rounded-md p-4 text-center text-white"
          style={{ backgroundColor: values.primaryColor }}
        >
          <p className="text-lg font-bold">Your Workshop Name</p>
          <p className="text-[9px] opacity-80">123 Main Street, City</p>
          <div className="mt-1 flex justify-center gap-3 text-[8px] opacity-70">
            <span>Tel: (555) 123-4567</span>
            <span>shop@example.com</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm font-bold">{documentLabel}</p>
          <div className="flex gap-3 text-[9px] text-gray-500">
            <span>{docNumber}</span>
            <span>Jan 15, 2026</span>
          </div>
        </div>
      </div>
    );
  }

  // Standard
  return (
    <div style={style}>
      <div
        className="flex items-start justify-between"
        style={{ borderBottom: `3px solid ${values.primaryColor}`, paddingBottom: 12 }}
      >
        <div>
          <div
            className="mb-1 flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold text-white"
            style={{ backgroundColor: values.primaryColor }}
          >
            Logo
          </div>
          <p className="text-sm font-bold" style={{ color: values.primaryColor }}>
            Your Workshop Name
          </p>
          <p className="text-[9px] text-gray-500">123 Main Street, City</p>
          <p className="text-[9px] text-gray-500">Tel: (555) 123-4567</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight" style={{ color: values.primaryColor }}>
            {documentLabel}
          </p>
          <p className="text-[9px] text-gray-500">{docNumber}</p>
          <p className="text-[9px] text-gray-500">Jan 15, 2026</p>
        </div>
      </div>
    </div>
  );
}

function TemplateTab({
  values,
  setValues,
  documentLabel,
  billToLabel,
}: {
  values: TemplateValues;
  setValues: (v: TemplateValues) => void;
  documentLabel: string;
  billToLabel: string;
}) {
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
          <CardTitle className="text-base">Template Presets</CardTitle>
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
              <Palette className="h-4 w-4" /> Primary Color
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
                  {preset.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Font & Layout Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Font & Layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select
                value={values.fontFamily}
                onValueChange={(v) => setValues({ ...values, fontFamily: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">Helvetica (Default)</SelectItem>
                  <SelectItem value="Times-Roman">Times Roman</SelectItem>
                  <SelectItem value="Courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Header Style</Label>
              <Select
                value={values.headerStyle}
                onValueChange={(v) => setValues({ ...values, headerStyle: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{documentLabel} Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="mx-auto max-w-[600px] rounded-lg border bg-white p-8 text-black"
            style={{ fontFamily: fontMap[values.fontFamily] || "sans-serif" }}
          >
            <PreviewHeader
              values={values}
              headerStyle={values.headerStyle}
              fontFamily={values.fontFamily}
              documentLabel={documentLabel === "Quotation" ? "QUOTE" : "INVOICE"}
            />

            {/* Bill To / Vehicle */}
            <div className="my-4 grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: values.primaryColor }}>
                  {billToLabel}
                </p>
                <p className="text-sm font-medium">John Smith</p>
                <p className="text-xs text-gray-500">john@example.com</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: values.primaryColor }}>
                  Vehicle
                </p>
                <p className="text-sm font-medium">2022 Toyota Camry</p>
                <p className="text-xs text-gray-500">VIN: 1HGBH41...XMN</p>
              </div>
            </div>

            {/* Parts Table */}
            <table className="mb-1 w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: `${values.primaryColor}15` }}>
                  <th className="px-2 py-1.5 text-left font-medium">Part</th>
                  <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Price</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-2 py-1.5">Brake Pads (Front)</td>
                  <td className="px-2 py-1.5 text-center">2</td>
                  <td className="px-2 py-1.5 text-right">$45.00</td>
                  <td className="px-2 py-1.5 text-right">$90.00</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-2 py-1.5">Oil Filter</td>
                  <td className="px-2 py-1.5 text-center">1</td>
                  <td className="px-2 py-1.5 text-right">$12.00</td>
                  <td className="px-2 py-1.5 text-right">$12.00</td>
                </tr>
              </tbody>
            </table>

            {/* Labor Table */}
            <table className="mb-4 w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: `${values.primaryColor}20` }}>
                  <th className="px-2 py-1.5 text-left font-medium">Labor</th>
                  <th className="px-2 py-1.5 text-center font-medium">Hours</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-2 py-1.5">Brake Replacement</td>
                  <td className="px-2 py-1.5 text-center">1.5</td>
                  <td className="px-2 py-1.5 text-right">$85.00</td>
                  <td className="px-2 py-1.5 text-right">$127.50</td>
                </tr>
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>$229.50</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax (8%)</span>
                  <span>$18.36</span>
                </div>
                <div
                  className="flex justify-between border-t-2 pt-1 text-sm font-bold"
                  style={{ borderColor: values.primaryColor, color: values.primaryColor }}
                >
                  <span>Total</span>
                  <span>$247.86</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

const smsTemplateFields = [
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
    label: "Invoice Ready",
    description: "Sent when sharing an invoice with a customer.",
    variables: ["{share_link}", "{company_name}", "{customer_name}", "{current_user}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
    label: "Inspection Ready",
    description: "Sent when sharing an inspection report with a customer.",
    variables: ["{share_link}", "{company_name}", "{customer_name}", "{current_user}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
    label: "Status: In Progress",
    description: "Sent when a work order status changes to In Progress.",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
    label: "Status: Waiting for Parts",
    description: "Sent when a work order status changes to Waiting for Parts.",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
    label: "Status: Ready for Pickup",
    description: "Sent when a work order status changes to Ready.",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
    label: "Status: Completed",
    description: "Sent when a work order status changes to Completed.",
    variables: ["{company_name}", "{customer_name}", "{current_user}", "{vehicle}"],
  },
  {
    key: SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
    label: "Payment Received",
    description: "Sent when a payment is recorded for an invoice.",
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
  const handleReset = (key: string) => {
    const defaultVal = SMS_TEMPLATE_DEFAULTS[key] || "";
    setValues({ ...values, [key]: defaultVal });
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> SMS Message Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Customize the text messages sent to customers. Use variables like{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{company_name}"}</code> to
            insert dynamic values.
          </p>
          <div className="space-y-6">
            {smsTemplateFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{field.label}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => handleReset(field.key)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Reset
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{field.description}</p>
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
}: {
  initialInvoiceValues: TemplateValues;
  initialQuoteValues: TemplateValues;
  inspectionTemplates?: InspectionTemplate[];
  smsEnabled?: boolean;
  initialSmsTemplates?: Record<string, string>;
}) {
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
        toast.success("Invoice template settings saved");
      } else if (tab === "quotation") {
        await Promise.all([
          setSetting(SETTING_KEYS.QUOTE_PRIMARY_COLOR, quoteValues.primaryColor),
          setSetting(SETTING_KEYS.QUOTE_FONT_FAMILY, quoteValues.fontFamily),
          setSetting(SETTING_KEYS.QUOTE_HEADER_STYLE, quoteValues.headerStyle),
        ]);
        toast.success("Quotation template settings saved");
      } else if (tab === "sms") {
        await Promise.all(
          Object.entries(smsValues).map(([key, value]) =>
            setSetting(key as Parameters<typeof setSetting>[0], value),
          ),
        );
        toast.success("SMS template settings saved");
      }
    } catch {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="text-sm text-muted-foreground">
          {tab === "inspections"
            ? "Manage inspection checklists and multi-point templates."
            : tab === "sms"
              ? "Customize the SMS messages sent to customers."
              : "Customize the appearance of your PDF invoices and quotes."}
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
          Invoice
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
          Quotation
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
          Inspections
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
            SMS
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
                Save SMS Templates
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
                documentLabel="Invoice"
                billToLabel="Bill To"
              />
            ) : (
              <TemplateTab
                values={quoteValues}
                setValues={setQuoteValues}
                documentLabel="Quotation"
                billToLabel="Prepared For"
              />
            )}
          </ReadOnlyWrapper>

          <SaveButton>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save {tab === "invoice" ? "Invoice" : "Quotation"} Template
              </Button>
            </div>
          </SaveButton>
        </>
      )}
    </div>
  );
}
