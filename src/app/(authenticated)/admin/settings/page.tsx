import { getSystemSettings } from "@/features/admin/Actions/getSystemSettings";
import { AdminSettings } from "@/features/admin/Components/admin-settings";
import { isCloudMode } from "@/lib/features";

export default async function AdminSettingsPage() {
  const result = await getSystemSettings();
  const data = result.data ?? {};

  return (
    <AdminSettings
      initial={data}
      mode={isCloudMode() ? "cloud" : "self-hosted"}
    />
  );
}
