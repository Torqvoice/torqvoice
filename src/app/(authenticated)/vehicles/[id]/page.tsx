import { getVehicle } from "@/features/vehicles/Actions/vehicleActions";
import { getServiceRecordsPaginated } from "@/features/vehicles/Actions/serviceActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { VehicleDetailClient } from "./vehicle-detail-client";
import { PageHeader } from "@/components/page-header";

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const page = Number(sp.page) || 1;
  const pageSize = Number(sp.pageSize) || 10;
  const search = typeof sp.search === "string" ? sp.search : "";
  const type = typeof sp.type === "string" ? sp.type : "all";

  const [result, customersResult, serviceResult, settingsResult] = await Promise.all([
    getVehicle(id),
    getCustomersList(),
    getServiceRecordsPaginated(id, { page, pageSize, search, type }),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Vehicle not found"}
          </p>
        </div>
      </>
    );
  }

  const paginatedServices = serviceResult.success && serviceResult.data
    ? serviceResult.data
    : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const currencySettings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = currencySettings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const unitSystem = (currencySettings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial";

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <VehicleDetailClient
          vehicle={result.data}
          customers={customersResult.data ?? []}
          paginatedServices={paginatedServices}
          serviceSearch={search}
          serviceType={type}
          currencyCode={currencyCode}
          unitSystem={unitSystem}
        />
      </div>
    </>
  );
}
