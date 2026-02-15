"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function InvoiceSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
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
    toast.success("Invoice settings saved");
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Invoice Layout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Configure what appears on generated PDF invoices.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">Invoice Number Format</Label>
              <Input
                id="invoicePrefix"
                placeholder="{year}-"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1">{"{year}"}</code> for the current year.
                Preview: <span className="font-medium">{invoicePrefix.replace(/\{year\}/g, String(new Date().getFullYear()))}1001</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceStartNumber">Next Invoice Number</Label>
              <Input
                id="invoiceStartNumber"
                type="number"
                min="1"
                placeholder="e.g. 94"
                value={invoiceStartNumber}
                onChange={(e) => setInvoiceStartNumber(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Next invoice will use this number (e.g. {invoicePrefix}{invoiceStartNumber || "..."})
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDays">Due Days</Label>
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
                Number of days until invoice is due
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Visibility on Invoice</h3>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Company Logo</Label>
                <p className="text-xs text-muted-foreground">
                  Display company logo in invoice header
                </p>
              </div>
              <Switch
                checked={showLogo}
                onCheckedChange={setShowLogo}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Company Name</Label>
                <p className="text-xs text-muted-foreground">
                  Display company name text in invoice header
                </p>
              </div>
              <Switch
                checked={showCompanyName}
                onCheckedChange={setShowCompanyName}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Bank Account</Label>
                <p className="text-xs text-muted-foreground">
                  Show bank account / IBAN on invoice
                </p>
              </div>
              <Switch
                checked={showBankAccount}
                onCheckedChange={setShowBankAccount}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Organization Number</Label>
                <p className="text-xs text-muted-foreground">
                  Show org number on invoice header
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
            <Label htmlFor="footerNote">Custom Invoice Footer</Label>
            <Textarea
              id="footerNote"
              placeholder="Thank you for your business!"
              rows={2}
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This text appears at the bottom of every invoice
            </p>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Invoice Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
