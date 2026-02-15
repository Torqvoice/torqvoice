import { getBillingHistory } from "@/features/billing/Actions/billingActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import BillingClient from "./billing-client";

export default async function BillingPage({
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
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 20;
  const search = params.search || "";
  const statusFilter = params.status || "all";

  const [result, settingsResult] = await Promise.all([
    getBillingHistory({ page, pageSize, search, status: statusFilter }),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
  ]);

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || "Failed to load billing data"}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <BillingClient
          data={result.data}
          currencyCode={currencyCode}
          search={search}
          statusFilter={statusFilter}
        />
      </div>
    </>
  );
}
