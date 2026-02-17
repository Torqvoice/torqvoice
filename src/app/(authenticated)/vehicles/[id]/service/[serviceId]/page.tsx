import { getServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getAuthContext } from "@/lib/get-auth-context";
import { ServiceDetailClient } from "@/features/vehicles/Components/service-detail/ServiceDetailClient";
import { PageHeader } from "@/components/page-header";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;
  const [result, settingsResult, authContext] = await Promise.all([
    getServiceRecord(serviceId),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getAuthContext(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Service record not found"}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial";

  return (
    <div className="flex h-svh flex-col">
      <PageHeader />
      <ServiceDetailClient record={result.data} vehicleId={id} organizationId={authContext?.organizationId || ""} currencyCode={currencyCode} unitSystem={unitSystem} />
    </div>
  );
}
