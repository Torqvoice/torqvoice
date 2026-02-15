import { getVehicle } from "@/features/vehicles/Actions/vehicleActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getInventoryPartsList } from "@/features/inventory/Actions/inventoryActions";
import { ServiceRecordForm } from "./service-record-form";
import { PageHeader } from "@/components/page-header";

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult, inventoryResult] = await Promise.all([
    getVehicle(id),
    getSettings([SETTING_KEYS.DEFAULT_TAX_RATE, SETTING_KEYS.TAX_ENABLED, SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_LABOR_RATE]),
    getInventoryPartsList(),
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

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled ? (Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0) : 0;
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const inventoryParts = inventoryResult.success && inventoryResult.data ? inventoryResult.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ServiceRecordForm
          vehicleId={id}
          vehicleName={`${result.data.year} ${result.data.make} ${result.data.model}`}
          defaultTaxRate={defaultTaxRate}
          taxEnabled={taxEnabled}
          defaultLaborRate={defaultLaborRate}
          currencyCode={currencyCode}
          inventoryParts={inventoryParts}
        />
      </div>
    </>
  );
}
