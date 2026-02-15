import { getQuote } from "@/features/quotes/Actions/quoteActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { PageHeader } from "@/components/page-header";
import { QuoteDetailClient } from "./quote-detail-client";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult, vehiclesResult] = await Promise.all([
    getQuote(id),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
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

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const vehicles = vehiclesResult.success && vehiclesResult.data
    ? vehiclesResult.data.map((v) => ({ id: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate }))
    : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <QuoteDetailClient quote={result.data} currencyCode={currencyCode} vehicles={vehicles} />
      </div>
    </>
  );
}
