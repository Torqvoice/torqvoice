import { getDashboardStats, getUpcomingReminders } from "@/features/vehicles/Actions/dashboardActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getVehiclesDueForService } from "@/features/vehicles/Actions/predictedMaintenanceActions";
import { DashboardClient } from "./dashboard-client";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const [result, settingsResult, remindersResult, maintenanceResult] = await Promise.all([
    getDashboardStats(),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getUpcomingReminders(),
    getVehiclesDueForService(),
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
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial";

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <DashboardClient
          stats={result.data}
          currencyCode={currencyCode}
          upcomingReminders={remindersResult.success && remindersResult.data ? remindersResult.data : []}
          vehiclesDueForService={maintenanceResult.success && maintenanceResult.data ? maintenanceResult.data : []}
          unitSystem={unitSystem}
        />
      </div>
    </>
  );
}
