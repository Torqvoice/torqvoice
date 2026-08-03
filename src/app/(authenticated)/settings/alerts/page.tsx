import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
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
  ]);
  const settings = result.success && result.data ? result.data : {};

  return <AlertsSettings settings={settings} />;
}
