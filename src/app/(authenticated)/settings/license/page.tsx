import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isCloudMode } from "@/lib/features";
import { LicenseSettings } from "@/features/settings/Components/license-settings";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

export default async function LicensePage() {
  if (isCloudMode()) {
    redirect("/settings");
  }

  const authContext = await getAuthContext();
  if (!authContext) redirect("/auth/sign-in");

  const settings = await db.appSetting.findMany({
    where: {
      organizationId: authContext.organizationId,
      key: {
        in: [
          SETTING_KEYS.LICENSE_KEY,
          SETTING_KEYS.LICENSE_VALID,
          SETTING_KEYS.LICENSE_CHECKED_AT,
          SETTING_KEYS.LICENSE_PLAN,
        ],
      },
    },
    select: { key: true, value: true },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return (
    <LicenseSettings
      initialKey={map.get(SETTING_KEYS.LICENSE_KEY) || ""}
      initialValid={map.get(SETTING_KEYS.LICENSE_VALID) === "true"}
      initialPlan={map.get(SETTING_KEYS.LICENSE_PLAN) || "free"}
      initialCheckedAt={map.get(SETTING_KEYS.LICENSE_CHECKED_AT) || ""}
    />
  );
}
