import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getTechnicians } from "@/features/workboard/Actions/technicianActions";
import { WorkshopSettings } from "./workshop-settings";

export default async function WorkshopSettingsPage() {
  const [result, techResult] = await Promise.all([
    getSettings(),
    getTechnicians(),
  ]);
  const settings = result.success && result.data ? result.data : {};
  const technicians = techResult.success && techResult.data
    ? techResult.data.map((t) => ({ id: t.id, name: t.name }))
    : [];

  return <WorkshopSettings settings={settings} technicians={technicians} />;
}
