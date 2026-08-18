import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { getOrgSmsProvider } from "@/lib/sms";
import { db } from "@/lib/db";
import { AlertsSettings } from "./alerts-settings";

export default async function AlertsSettingsPage() {
  const result = await getSettings([
    SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED,
    SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
    SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP,
    SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL,
    SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS,
    SETTING_KEYS.SERVICE_REQUEST_ALERTS_EMAIL,
    SETTING_KEYS.SERVICE_REQUEST_ALERTS_RECIPIENTS,
    SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_ENABLED,
    SETTING_KEYS.CUSTOMER_REMINDERS_INSPECTION_LEAD_DAYS,
    SETTING_KEYS.CUSTOMER_REMINDERS_SERVICE_ENABLED,
    SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_EMAIL,
    SETTING_KEYS.CUSTOMER_REMINDERS_CHANNEL_SMS,
    SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE,
    SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE,
  ]);
  const settings = result.success && result.data ? result.data : {};

  const layout = await getLayoutData();
  let smsFeature = false;
  let smsConfigured = false;
  let companyName = "";
  if (layout.status === "ok" && layout.organizationId) {
    const [features, provider, org] = await Promise.all([
      getFeatures(layout.organizationId),
      getOrgSmsProvider(layout.organizationId),
      db.organization.findUnique({
        where: { id: layout.organizationId },
        select: { name: true },
      }),
    ]);
    smsFeature = features.sms;
    smsConfigured = provider !== null;
    companyName = org?.name ?? "";
  }

  return (
    <AlertsSettings
      settings={settings}
      smsFeature={smsFeature}
      smsConfigured={smsConfigured}
      companyName={companyName}
    />
  );
}
