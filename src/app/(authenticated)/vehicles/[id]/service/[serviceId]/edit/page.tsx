import { getServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getInventoryPartsList } from "@/features/inventory/Actions/inventoryActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { ServiceRecordForm } from "../../new/service-record-form";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;
  const [result, settingsResult, inventoryResult, vehiclesResult] = await Promise.all([
    getServiceRecord(serviceId),
    getSettings([SETTING_KEYS.DEFAULT_TAX_RATE, SETTING_KEYS.TAX_ENABLED, SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_LABOR_RATE]),
    getInventoryPartsList(),
    getVehicles(),
  ]);

  if (!result.success || !result.data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">
          {result.error || "Service record not found"}
        </p>
      </div>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled ? (Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0) : 0;
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const inventoryParts = inventoryResult.success && inventoryResult.data ? inventoryResult.data : [];
  const vehicles = (vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data : []).map((v) => ({
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`,
  }));
  const record = result.data;

  const initialData = {
    id: record.id,
    title: record.title,
    description: record.description || "",
    type: record.type,
    status: record.status,
    mileage: record.mileage,
    serviceDate: new Date(record.serviceDate).toISOString().split("T")[0],
    techName: record.techName || "",
    diagnosticNotes: record.diagnosticNotes || "",
    invoiceNotes: record.invoiceNotes || "",
    invoiceNumber: record.invoiceNumber || "",
    partItems: record.partItems.map((p) => ({
      partNumber: p.partNumber || "",
      name: p.name,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      total: p.total,
    })),
    laborItems: record.laborItems.map((l) => ({
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      total: l.total,
    })),
    attachments: [],
    subtotal: record.subtotal,
    taxRate: record.taxRate,
    taxAmount: record.taxAmount,
    totalAmount: record.totalAmount,
  };

  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`;

  return (
    <ServiceRecordForm
      vehicleId={id}
      vehicleName={vehicleName}
      defaultTaxRate={defaultTaxRate}
      taxEnabled={taxEnabled}
      defaultLaborRate={defaultLaborRate}
      currencyCode={currencyCode}
      initialData={initialData}
      inventoryParts={inventoryParts}
      vehicles={vehicles}
    />
  );
}
