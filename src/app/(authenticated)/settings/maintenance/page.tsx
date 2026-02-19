import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { MaintenanceSettings } from "./maintenance-settings";

export default async function MaintenanceSettingsPage() {
  const result = await getSettings([
    SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
    SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
    SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
    SETTING_KEYS.UNIT_SYSTEM,
  ]);
  const settings = result.success && result.data ? result.data : {};

  return <MaintenanceSettings settings={settings} />;
}
