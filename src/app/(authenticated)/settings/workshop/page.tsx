import { getSettings } from "@/features/settings/Actions/settingsActions";
import { WorkshopSettings } from "./workshop-settings";

export default async function WorkshopSettingsPage() {
  const result = await getSettings();
  const settings = result.success && result.data ? result.data : {};

  return <WorkshopSettings settings={settings} />;
}
