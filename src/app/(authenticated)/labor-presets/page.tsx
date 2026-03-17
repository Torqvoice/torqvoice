import { getLaborPresetsPaginated } from "@/features/labor-presets/Actions/laborPresetActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { LaborPresetsClient } from "./labor-presets-client";
import { PageHeader } from "@/components/page-header";

export default async function LaborPresetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>;
}) {
  const params = await searchParams;
  const [result, settingsResult] = await Promise.all([
    getLaborPresetsPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.DEFAULT_LABOR_RATE]),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load labor presets"}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <LaborPresetsClient
          data={result.data}
          search={params.search || ""}
          currencyCode={currencyCode}
          defaultLaborRate={defaultLaborRate}
        />
      </div>
    </>
  );
}
