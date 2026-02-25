import { getTranslations } from "next-intl/server";
import { getDashboardStats, getUpcomingReminders } from "@/features/vehicles/Actions/dashboardActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getVehiclesDueForService } from "@/features/vehicles/Actions/predictedMaintenanceActions";
import { getInspectionsPaginated } from "@/features/inspections/Actions/inspectionActions";
import { getQuoteRequests } from "@/features/inspections/Actions/quoteRequestActions";
import { getQuoteResponses } from "@/features/quotes/Actions/quoteResponseActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { getRecentSmsThreads } from "@/features/sms/Actions/smsActions";
import { getNotifications } from "@/features/notifications/Actions/notificationActions";
import { DashboardClient } from "./dashboard-client";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const auth = await getAuthContext();
  const features = auth ? await getFeatures(auth.organizationId) : null;
  const smsEnabled = features?.sms ?? false;

  const [result, settingsResult, remindersResult, maintenanceResult, inProgressResult, completedResult, quoteRequestsResult, quoteResponsesResult, smsResult, notificationsResult] = await Promise.all([
    getDashboardStats(),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getUpcomingReminders(),
    getVehiclesDueForService(),
    getInspectionsPaginated({ status: "in_progress", pageSize: 5 }),
    getInspectionsPaginated({ status: "completed", pageSize: 5 }),
    getQuoteRequests(),
    getQuoteResponses(),
    smsEnabled ? getRecentSmsThreads(0, 5) : Promise.resolve(null),
    getNotifications(),
  ]);

  if (!result.success || !result.data) {
    const t = await getTranslations("dashboard");
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || t("error")}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial";
  const smsThreads = smsResult && smsResult.success && smsResult.data ? smsResult.data.threads : [];
  const notifications = notificationsResult.success && notificationsResult.data ? notificationsResult.data.notifications : [];

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
          inProgressInspections={inProgressResult.success && inProgressResult.data ? inProgressResult.data.records : []}
          completedInspections={completedResult.success && completedResult.data ? completedResult.data.records : []}
          quoteRequests={quoteRequestsResult.success && quoteRequestsResult.data ? quoteRequestsResult.data : []}
          quoteResponses={quoteResponsesResult.success && quoteResponsesResult.data ? quoteResponsesResult.data : []}
          smsThreads={smsThreads}
          smsEnabled={smsEnabled}
          notifications={notifications}
        />
      </div>
    </>
  );
}
