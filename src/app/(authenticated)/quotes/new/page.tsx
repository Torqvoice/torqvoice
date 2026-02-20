import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/features/quotes/Components/QuoteForm";
import { getCustomers } from "@/features/customers/Actions/customerActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getInspection } from "@/features/inspections/Actions/inspectionActions";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ fromInspection?: string }>;
}) {
  const params = await searchParams;

  const [settingsResult, customersResult, vehiclesResult] = await Promise.all([
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_TAX_RATE, SETTING_KEYS.TAX_ENABLED, SETTING_KEYS.DEFAULT_LABOR_RATE, SETTING_KEYS.QUOTE_VALID_DAYS]),
    getCustomers(),
    getVehicles(),
  ]);

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled ? (Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0) : 0;
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const quoteValidDays = Number(settings[SETTING_KEYS.QUOTE_VALID_DAYS]) || 30;
  const customers = customersResult.success && customersResult.data ? customersResult.data : [];
  const vehicles = vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data : [];

  // Build prefill data from inspection if provided
  let prefill: { title?: string; vehicleId?: string; customerId?: string; laborItems?: { description: string; hours: number; rate: number; total: number }[] } | undefined;

  if (params.fromInspection) {
    const inspResult = await getInspection(params.fromInspection);
    if (inspResult.success && inspResult.data) {
      const insp = inspResult.data;
      const issueItems = insp.items.filter(
        (i: { condition: string }) => i.condition === "fail" || i.condition === "attention"
      );
      prefill = {
        title: `Inspection Repairs — ${insp.vehicle.year} ${insp.vehicle.make} ${insp.vehicle.model}`,
        vehicleId: insp.vehicle.id,
        customerId: insp.vehicle.customer?.id || undefined,
        laborItems: issueItems.map((item: { name: string; section: string; notes: string | null }) => ({
          description: `${item.section}: ${item.name}${item.notes ? ` — ${item.notes}` : ""}`,
          hours: 0,
          rate: defaultLaborRate,
          total: 0,
        })),
      };
    }
  }

  return (
    <>
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <QuoteForm
          currencyCode={currencyCode}
          defaultTaxRate={defaultTaxRate}
          taxEnabled={taxEnabled}
          defaultLaborRate={defaultLaborRate}
          quoteValidDays={quoteValidDays}
          customers={customers.map((c: { id: string; name: string; email: string | null; company: string | null }) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
          }))}
          vehicles={vehicles.map((v: { id: string; make: string; model: string; year: number; licensePlate: string | null; customer: { id: string; name: string; company: string | null } | null }) => ({
            id: v.id,
            make: v.make,
            model: v.model,
            year: v.year,
            licensePlate: v.licensePlate,
            customerId: v.customer?.id || null,
            customerName: v.customer?.name || null,
          }))}
          prefill={prefill}
        />
      </div>
    </>
  );
}
