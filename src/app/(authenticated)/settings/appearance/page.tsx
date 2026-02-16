import { AppearanceSettings } from "./appearance-settings";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/get-auth-context";
import { redirect } from "next/navigation";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

export default async function AppearanceSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");

  const rows = await db.appSetting.findMany({
    where: {
      organizationId: ctx.organizationId,
      key: {
        in: [
          SETTING_KEYS.DATE_FORMAT,
          SETTING_KEYS.TIME_FORMAT,
          SETTING_KEYS.TIMEZONE,
        ],
      },
    },
  });

  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  return <AppearanceSettings settings={settings} />;
}
