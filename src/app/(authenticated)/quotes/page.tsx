import { getQuotesPaginated } from "@/features/quotes/Actions/quoteActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { QuotesClient } from "./quotes-client";
import { PageHeader } from "@/components/page-header";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const [result, settingsResult] = await Promise.all([
    getQuotesPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      status: params.status || "all",
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load quotes"}
          </p>
        </div>
      </>
    );
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <QuotesClient
          data={result.data}
          currencyCode={currencyCode}
          search={params.search || ""}
          statusFilter={params.status || "all"}
        />
      </div>
    </>
  );
}
