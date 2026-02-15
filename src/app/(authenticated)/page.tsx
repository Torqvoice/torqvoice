import { getDashboardStats, getUpcomingReminders } from "@/features/vehicles/Actions/dashboardActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { DashboardClient } from "./dashboard-client";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const [result, settingsResult, remindersResult] = await Promise.all([
    getDashboardStats(),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getUpcomingReminders(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load dashboard"}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <DashboardClient
          stats={result.data}
          currencyCode={currencyCode}
          upcomingReminders={remindersResult.success && remindersResult.data ? remindersResult.data : []}
        />
      </div>
    </>
  );
}
