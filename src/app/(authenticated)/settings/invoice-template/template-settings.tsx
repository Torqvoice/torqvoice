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
import { Loader2, Palette } from "lucide-react";

interface TemplateValues {
  primaryColor: string;
  fontFamily: string;
  headerStyle: string;
}

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

export function TemplateSettings({
  initialValues,
}: {
  initialValues: TemplateValues;
}) {
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(initialValues);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        setSetting(SETTING_KEYS.INVOICE_PRIMARY_COLOR, values.primaryColor),
        setSetting(SETTING_KEYS.INVOICE_FONT_FAMILY, values.fontFamily),
        setSetting(SETTING_KEYS.INVOICE_HEADER_STYLE, values.headerStyle),
      ]);
      toast.success("Template settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invoice Template</h2>
        <p className="text-sm text-muted-foreground">
          Customize the appearance of your PDF invoices and quotes.
        </p>
      </div>

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
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-3" style={{ borderBottom: `3px solid ${values.primaryColor}`, paddingBottom: 8 }}>
                <span className="text-lg font-bold" style={{ color: values.primaryColor }}>Workshop Name</span>
                <span className="ml-auto font-bold">INVOICE</span>
              </div>
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

      {/* Invoice Preview */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Invoice Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="mx-auto max-w-[600px] rounded-lg border bg-white p-8 text-black"
            style={{ fontFamily: fontMap[values.fontFamily] || "sans-serif" }}
          >
            {/* Header */}
            <div
              className="mb-6 flex items-start justify-between"
              style={{ borderBottom: `3px solid ${values.primaryColor}`, paddingBottom: 16 }}
            >
              <div>
                <div
                  className="mb-2 flex h-10 w-10 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ backgroundColor: values.primaryColor }}
                >
                  Logo
                </div>
                <p className="text-lg font-bold" style={{ color: values.primaryColor }}>
                  Your Workshop Name
                </p>
                <p className="text-xs text-gray-500">123 Main Street, City, State 12345</p>
                <p className="text-xs text-gray-500">Phone: (555) 123-4567</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tracking-tight" style={{ color: values.primaryColor }}>
                  INVOICE
                </p>
                <p className="text-xs text-gray-500">INV-1001</p>
                <p className="text-xs text-gray-500">Date: Jan 15, 2026</p>
              </div>
            </div>

            {/* Bill To / Vehicle */}
            <div className="mb-6 grid grid-cols-2 gap-6">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: values.primaryColor }}>
                  Bill To
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
                <tr style={{ backgroundColor: values.primaryColor }}>
                  <th className="px-2 py-1.5 text-left font-medium text-white">Part</th>
                  <th className="px-2 py-1.5 text-center font-medium text-white">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium text-white">Price</th>
                  <th className="px-2 py-1.5 text-right font-medium text-white">Total</th>
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Template Settings
        </Button>
      </div>
    </div>
  );
}
