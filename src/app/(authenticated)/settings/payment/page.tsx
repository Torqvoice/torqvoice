import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { PaymentSettings } from "./payment-settings";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function PaymentSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.payments) {
    return (
      <FeatureLockedMessage
        feature="Payment Settings"
        description="Configure payment providers, terms, and online payment options for your invoices."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getSettings();
  const settings = result.success && result.data ? result.data : {};

  return <PaymentSettings settings={settings} />;
}
