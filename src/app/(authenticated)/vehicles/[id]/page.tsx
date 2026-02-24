import { getVehicle } from "@/features/vehicles/Actions/vehicleActions";
import { getServiceRecordsPaginated } from "@/features/vehicles/Actions/serviceActions";
import { getNotesPaginated } from "@/features/vehicles/Actions/noteActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getVehiclePredictedMileage } from "@/features/vehicles/Actions/predictedMaintenanceActions";
import { getVehicleInspections } from "@/features/inspections/Actions/inspectionActions";
import { getTemplates } from "@/features/inspections/Actions/templateActions";
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

  const notesPage = Number(sp.notesPage) || 1;
  const notesPageSize = Number(sp.notesPageSize) || 10;

  const [result, customersResult, serviceResult, notesResult, settingsResult, maintenanceSettingsResult, inspectionsResult, templatesResult] = await Promise.all([
    getVehicle(id),
    getCustomersList(),
    getServiceRecordsPaginated(id, { page, pageSize, search, type }),
    getNotesPaginated(id, { page: notesPage, pageSize: notesPageSize }),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getSettings([
      SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
      SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
      SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
    ]),
    getVehicleInspections(id),
    getTemplates(),
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

  const paginatedNotes = notesResult.success && notesResult.data
    ? notesResult.data
    : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const currencySettings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = currencySettings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const unitSystem = (currencySettings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial";

  const maintenanceSettings = maintenanceSettingsResult.success && maintenanceSettingsResult.data
    ? maintenanceSettingsResult.data
    : {};
  const maintenanceEnabled = maintenanceSettings[SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED] === "true";
  const serviceInterval = parseInt(maintenanceSettings[SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL] || "15000", 10);

  let predictionData: {
    predictedMileage: number;
    avgPerDay: number;
    lastServiceMileage: number;
    serviceInterval: number;
    mileageSinceLastService: number;
    status: "overdue" | "approaching" | "ok" | null;
    maintenanceDismissed: boolean;
    confidencePercent: number;
  } | null = null;

  const predResult = await getVehiclePredictedMileage(id);
  if (predResult.success && predResult.data) {
    const p = predResult.data;
    const mileageSinceLastService = p.predictedMileage - p.lastServiceMileage;

    let status: "overdue" | "approaching" | "ok" | null = null;
    if (maintenanceEnabled) {
      const approachingThreshold = parseInt(maintenanceSettings[SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD] || "1000", 10);
      status = "ok";
      if (mileageSinceLastService >= serviceInterval) {
        status = "overdue";
      } else if (mileageSinceLastService >= serviceInterval - approachingThreshold) {
        status = "approaching";
      }
    }

    predictionData = {
      predictedMileage: p.predictedMileage,
      avgPerDay: p.avgPerDay,
      lastServiceMileage: p.lastServiceMileage,
      serviceInterval,
      mileageSinceLastService,
      status,
      maintenanceDismissed: result.data.maintenanceDismissed,
      confidencePercent: p.confidencePercent,
    };
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <VehicleDetailClient
          vehicle={result.data}
          customers={customersResult.data ?? []}
          paginatedServices={paginatedServices}
          paginatedNotes={paginatedNotes}
          serviceSearch={search}
          serviceType={type}
          currencyCode={currencyCode}
          unitSystem={unitSystem}
          predictionData={predictionData}
          inspections={inspectionsResult.success && inspectionsResult.data ? inspectionsResult.data : []}
          inspectionTemplates={templatesResult.success && templatesResult.data ? templatesResult.data : []}
        />
      </div>
    </>
  );
}
