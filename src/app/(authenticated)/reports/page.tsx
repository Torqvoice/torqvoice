import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { redirect } from "next/navigation";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.reports) {
    return (
      <>
        <PageHeader />
        <UpgradePrompt feature="Reports & Analytics" />
      </>
    );
  }

  const settingsResult = await getSettings([SETTING_KEYS.CURRENCY_CODE]);
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ReportsClient currencyCode={currencyCode} />
      </div>
    </>
  );
}
