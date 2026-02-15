import { redirect } from "next/navigation";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { PaymentSettings } from "./payment-settings";

export default async function PaymentSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.payments) {
    redirect("/settings");
  }

  const result = await getSettings();
  const settings = result.success && result.data ? result.data : {};

  return <PaymentSettings settings={settings} />;
}
