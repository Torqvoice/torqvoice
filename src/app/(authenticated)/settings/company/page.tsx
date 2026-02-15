import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { CompanySettings } from "./company-settings";

export default async function CompanySettingsPage() {
  const [result, authContext] = await Promise.all([
    getSettings(),
    getAuthContext(),
  ]);
  const settings = result.success && result.data ? result.data : {};

  const org = authContext
    ? await db.organization.findUnique({
        where: { id: authContext.organizationId },
        select: { name: true },
      })
    : null;

  return <CompanySettings settings={settings} organizationName={org?.name || ""} />;
}
