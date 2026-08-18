"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppCard } from "@/components/app-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { setSettings } from "@/features/settings/Actions/settingsActions";
import { runLowStockCheck } from "@/features/inventory/Actions/runLowStockCheck";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { parseInvalidRecipients } from "@/features/portal/Lib/serviceRequestAlert";
import { interpolateSmsTemplate } from "@/lib/sms-templates";
import { BellRing, Loader2, PackageSearch, PlayCircle, Save, Wrench } from "lucide-react";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

/**
 * Alert preferences.
 *
 * Each alert type is a self-contained card owning its own state and save, so
 * adding another (overdue invoices, expiring warranties, upcoming reminders)
 * means dropping in a sibling card rather than reworking this page.
 */
export function AlertsSettings({
  settings,
  smsFeature = false,
  smsConfigured = false,
  companyName = "",
}: {
  settings: Record<string, string>;
  smsFeature?: boolean;
  smsConfigured?: boolean;
  companyName?: string;
}) {
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
          <CustomerRemindersCard
            settings={settings}
            smsFeature={smsFeature}
            smsConfigured={smsConfigured}
            companyName={companyName}
          />
          <ServiceRequestAlertCard settings={settings} />
          <LowStockAlertCard settings={settings} />
        </div>
      </ReadOnlyWrapper>
    </div>
  );
}

/**
 * Automated customer reminders: inspection due and service due. Everything is
 * off by default; enabling either type is an explicit action, because these
 * messages go to customers, not to staff.
 */
function CustomerRemindersCard({
  settings,
  smsFeature,
  smsConfigured,
  companyName,
}: {
  settings: Record<string, string>;
  smsFeature: boolean;
  smsConfigured: boolean;
  companyName: string;
}) {
  const router = useRouter();
  const t = useTranslations("settings");
  const [saving, setSaving] = useState(false);

  const [inspectionEnabled, setInspectionEnabled] = useState(
    settings[SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED] === "true",
  );
  const [leadDays, setLeadDays] = useState(
    settings[SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS] || "30",
  );
  const [serviceEnabled, setServiceEnabled] = useState(
    settings[SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED] === "true",
  );
  const [emailChannel, setEmailChannel] = useState(
    settings[SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL] !== "false",
  );
  const [smsChannel, setSmsChannel] = useState(
    settings[SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS] === "true",
  );

  const anyEnabled = inspectionEnabled || serviceEnabled;
  const smsAvailable = smsFeature && smsConfigured;

  // Preview with sample data, using the org's customized template when one is
  // saved and the localized default otherwise, exactly like the cron does.
  const previewVars = {
    customer_name: t("alerts.customerReminders.sampleCustomer"),
    vehicle: "2019 Volvo V70 (AB 12345)",
    license_plate: "AB 12345",
    due_date: new Date(
      Date.now() + (Number(leadDays) || 30) * 24 * 60 * 60 * 1000,
    ).toLocaleDateString(),
    company_name: companyName || t("alerts.customerReminders.sampleCompany"),
  };
  const inspectionPreview = interpolateSmsTemplate(
    settings[SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE] ||
      t.raw("templates.smsDefaults.inspectionDue"),
    previewVars,
  );
  const servicePreview = interpolateSmsTemplate(
    settings[SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE] ||
      t.raw("templates.smsDefaults.serviceDue"),
    previewVars,
  );

  const handleSave = async () => {
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED]: inspectionEnabled
        ? "true"
        : "false",
      [SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS]: String(
        Math.min(365, Math.max(1, Number(leadDays) || 30)),
      ),
      [SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED]: serviceEnabled
        ? "true"
        : "false",
      [SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL]: emailChannel ? "true" : "false",
      [SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS]: smsChannel ? "true" : "false",
    });
    setSaving(false);
    router.refresh();
    toast.success(t("alerts.customerReminders.saved"));
  };

  return (
    <AppCard
      icon={BellRing}
      title={t("alerts.customerReminders.title")}
      contentClassName="space-y-6"
    >
      <p className="text-sm text-muted-foreground">
        {t("alerts.customerReminders.description")}
      </p>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5 pr-4">
          <Label htmlFor="crInspectionEnabled">
            {t("alerts.customerReminders.enableInspection")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("alerts.customerReminders.enableInspectionHint")}
          </p>
        </div>
        <Switch
          id="crInspectionEnabled"
          checked={inspectionEnabled}
          onCheckedChange={setInspectionEnabled}
        />
      </div>

      {inspectionEnabled && (
        <div className="space-y-2">
          <Label htmlFor="crLeadDays">{t("alerts.customerReminders.leadDays")}</Label>
          <Input
            id="crLeadDays"
            type="number"
            min="1"
            max="365"
            value={leadDays}
            onChange={(e) => setLeadDays(e.target.value)}
            className="max-w-[160px]"
          />
          <p className="text-xs text-muted-foreground">
            {t("alerts.customerReminders.leadDaysHint")}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5 pr-4">
          <Label htmlFor="crServiceEnabled">
            {t("alerts.customerReminders.enableService")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("alerts.customerReminders.enableServiceHint")}{" "}
            <Link href="/settings/maintenance" className="text-primary hover:underline">
              {t("alerts.customerReminders.maintenanceSettingsLink")}
            </Link>
          </p>
        </div>
        <Switch
          id="crServiceEnabled"
          checked={serviceEnabled}
          onCheckedChange={setServiceEnabled}
        />
      </div>

      {anyEnabled && (
        <>
          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="crEmailChannel">
                {t("alerts.customerReminders.channelEmail")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("alerts.customerReminders.channelEmailHint")}
              </p>
            </div>
            <Switch
              id="crEmailChannel"
              checked={emailChannel}
              onCheckedChange={setEmailChannel}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="crSmsChannel">
                {t("alerts.customerReminders.channelSms")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {!smsFeature
                  ? t("alerts.customerReminders.smsRequiresPro")
                  : !smsConfigured
                    ? t("alerts.customerReminders.smsNotConfigured")
                    : t("alerts.customerReminders.channelSmsHint")}{" "}
                {smsFeature && !smsConfigured && (
                  <Link href="/settings/sms" className="text-primary hover:underline">
                    {t("alerts.customerReminders.smsSetupLink")}
                  </Link>
                )}
              </p>
            </div>
            <Switch
              id="crSmsChannel"
              checked={smsChannel && smsAvailable}
              onCheckedChange={setSmsChannel}
              disabled={!smsAvailable}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>{t("alerts.customerReminders.preview")}</Label>
            {inspectionEnabled && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("alerts.customerReminders.previewInspection")}
                </p>
                {inspectionPreview}
              </div>
            )}
            {serviceEnabled && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("alerts.customerReminders.previewService")}
                </p>
                {servicePreview}
              </div>
            )}
            {smsFeature && (
              <p className="text-xs text-muted-foreground">
                {t("alerts.customerReminders.customizeHint")}{" "}
                <Link
                  href="/settings/templates?tab=sms"
                  className="text-primary hover:underline"
                >
                  {t("alerts.customerReminders.customizeLink")}
                </Link>
              </p>
            )}
          </div>
        </>
      )}

      <SaveButton>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("alerts.customerReminders.save")}
        </Button>
      </SaveButton>
    </AppCard>
  );
}

function ServiceRequestAlertCard({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState(
    settings[SETTING_KEYS.SERVICE_REQUEST_ALERTS_EMAIL] === "true",
  );
  const [recipients, setRecipients] = useState(
    settings[SETTING_KEYS.SERVICE_REQUEST_ALERTS_RECIPIENTS] || "",
  );

  // Addresses are validated on save rather than while typing, so the field does
  // not flag a half-written address on every keystroke.
  const invalid = parseInvalidRecipients(recipients);

  const handleSave = async () => {
    if (email && invalid.length > 0) {
      toast.error(t("alerts.serviceRequest.invalidRecipients", { list: invalid.join(", ") }));
      return;
    }
    setSaving(true);
    await setSettings({
      [SETTING_KEYS.SERVICE_REQUEST_ALERTS_EMAIL]: email ? "true" : "false",
      [SETTING_KEYS.SERVICE_REQUEST_ALERTS_RECIPIENTS]: recipients.trim(),
    });
    setSaving(false);
    router.refresh();
    toast.success(t("alerts.serviceRequest.saved"));
  };

  return (
    <AppCard icon={Wrench} title={t("alerts.serviceRequest.title")} contentClassName="space-y-6">
        <p className="text-sm text-muted-foreground">
          {t("alerts.serviceRequest.description")}
        </p>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="serviceRequestEmail">{t("alerts.serviceRequest.email")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("alerts.serviceRequest.emailHint")}
            </p>
          </div>
          <Switch
            id="serviceRequestEmail"
            checked={email}
            onCheckedChange={setEmail}
          />
        </div>

        {email && (
          <>
            <Separator />

            <div className="space-y-2">
              <Label htmlFor="serviceRequestRecipients">
                {t("alerts.serviceRequest.recipients")}
              </Label>
              <Input
                id="serviceRequestRecipients"
                type="text"
                placeholder="service@example.com, owner@example.com"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("alerts.serviceRequest.recipientsHint")}
              </p>
              {invalid.length > 0 && (
                <p className="text-xs text-destructive">
                  {t("alerts.serviceRequest.invalidRecipients", { list: invalid.join(", ") })}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t("alerts.serviceRequest.emailSetupHint")}{" "}
              <Link href="/settings/email" className="text-primary hover:underline">
                {t("alerts.serviceRequest.emailSetupLink")}
              </Link>
            </p>
          </>
        )}

        <SaveButton>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("alerts.serviceRequest.save")}
          </Button>
        </SaveButton>
    </AppCard>
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
    <AppCard
      icon={PackageSearch}
      title={t("alerts.lowStock.title")}
      action={
        <a
          href="https://torqvoice.com/docs/features/low-stock-alerts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("alerts.lowStock.readMore")} →
        </a>
      }
      contentClassName="space-y-6"
    >
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
    </AppCard>
  );
}
