import { getCustomer } from "@/features/customers/Actions/customerActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { CustomerDetailClient } from "./customer-detail-client";
import { PageHeader } from "@/components/page-header";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, settingsResult] = await Promise.all([
    getCustomer(id),
    getSettings([SETTING_KEYS.UNIT_SYSTEM]),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Customer not found"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CustomerDetailClient customer={result.data} unitSystem={(settingsResult.success && settingsResult.data?.[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as "metric" | "imperial"} />
      </div>
    </>
  );
}
