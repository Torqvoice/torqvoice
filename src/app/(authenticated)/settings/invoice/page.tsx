import { getSettings } from "@/features/settings/Actions/settingsActions";
import { InvoiceSettings } from "./invoice-settings";

export default async function InvoiceSettingsPage() {
  const result = await getSettings();
  const settings = result.success && result.data ? result.data : {};

  return <InvoiceSettings settings={settings} />;
}
