import { getSettings } from "@/features/settings/Actions/settingsActions";
import { CurrencySettings } from "./currency-settings";

export default async function CurrencySettingsPage() {
  const result = await getSettings();
  const settings = result.success && result.data ? result.data : {};

  return <CurrencySettings settings={settings} />;
}
