import { getQuote } from "@/features/quotes/Actions/quoteActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getCustomers } from "@/features/customers/Actions/customerActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/features/quotes/Components/QuoteForm";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult, customersResult, vehiclesResult] = await Promise.all([
    getQuote(id),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_TAX_RATE, SETTING_KEYS.TAX_ENABLED, SETTING_KEYS.DEFAULT_LABOR_RATE]),
    getCustomers(),
    getVehicles(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || "Quote not found"}</p>
        </div>
      </>
    );
  }

  const quote = result.data;
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled ? (Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0) : 0;
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const customers = customersResult.success && customersResult.data ? customersResult.data : [];
  const vehicles = vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <QuoteForm
          currencyCode={currencyCode}
          defaultTaxRate={defaultTaxRate}
          taxEnabled={taxEnabled}
          defaultLaborRate={defaultLaborRate}
          customers={customers.map((c: { id: string; name: string; email: string | null; company: string | null }) => ({
            id: c.id, name: c.name, email: c.email, company: c.company,
          }))}
          vehicles={vehicles.map((v: { id: string; make: string; model: string; year: number; licensePlate: string | null }) => ({
            id: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate,
          }))}
          initialData={{
            id: quote.id,
            title: quote.title,
            description: quote.description,
            status: quote.status,
            validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString() : null,
            customerId: quote.customer?.id || null,
            vehicleId: quote.vehicle?.id || null,
            notes: quote.notes,
            partItems: quote.partItems.map((p) => ({
              partNumber: p.partNumber || "",
              name: p.name,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              total: p.total,
            })),
            laborItems: quote.laborItems.map((l) => ({
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              total: l.total,
            })),
            subtotal: quote.subtotal,
            taxRate: quote.taxRate,
            taxAmount: quote.taxAmount,
            discountType: quote.discountType,
            discountValue: quote.discountValue,
            discountAmount: quote.discountAmount,
            totalAmount: quote.totalAmount,
          }}
        />
      </div>
    </>
  );
}
