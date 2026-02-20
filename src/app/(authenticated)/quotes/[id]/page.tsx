import { getQuote } from "@/features/quotes/Actions/quoteActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getCustomers } from "@/features/customers/Actions/customerActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { PageHeader } from "@/components/page-header";
import { QuotePageClient } from "@/features/quotes/Components/QuotePageClient";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult, customersResult, vehiclesResult, authContext] =
    await Promise.all([
      getQuote(id),
      getSettings([
        SETTING_KEYS.CURRENCY_CODE,
        SETTING_KEYS.DEFAULT_TAX_RATE,
        SETTING_KEYS.TAX_ENABLED,
        SETTING_KEYS.DEFAULT_LABOR_RATE,
      ]),
      getCustomers(),
      getVehicles(),
      getAuthContext(),
    ]);

  if (!result.success || !result.data) {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Quote not found"}
          </p>
        </div>
      </div>
    );
  }

  const settings =
    settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled
    ? Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0
    : 0;
  const defaultLaborRate =
    Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const customers =
    customersResult.success && customersResult.data
      ? customersResult.data
      : [];
  const vehicles =
    vehiclesResult.success && vehiclesResult.data
      ? vehiclesResult.data
      : [];
  const organizationId = authContext?.organizationId || "";

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <QuotePageClient
        quote={result.data}
        organizationId={organizationId}
        currencyCode={currencyCode}
        defaultTaxRate={defaultTaxRate}
        taxEnabled={taxEnabled}
        defaultLaborRate={defaultLaborRate}
        customers={customers.map(
          (c: {
            id: string;
            name: string;
            email: string | null;
            company: string | null;
          }) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
          })
        )}
        vehicles={vehicles.map(
          (v: {
            id: string;
            make: string;
            model: string;
            year: number;
            licensePlate: string | null;
            customer: {
              id: string;
              name: string;
              company: string | null;
            } | null;
          }) => ({
            id: v.id,
            make: v.make,
            model: v.model,
            year: v.year,
            licensePlate: v.licensePlate,
            customerId: v.customer?.id || null,
            customerName: v.customer?.name || null,
          })
        )}
      />
    </div>
  );
}
