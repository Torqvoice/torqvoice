import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/features/quotes/Components/QuoteForm";
import { getCustomers } from "@/features/customers/Actions/customerActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";

export default async function NewQuotePage() {
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
        />
      </div>
    </>
  );
}
