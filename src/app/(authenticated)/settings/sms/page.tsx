import { getSmsSettings } from "@/features/sms/Actions/smsSettingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { SmsSettingsForm } from "@/features/sms/Components/SmsSettingsForm";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function SmsSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.sms) {
    return (
      <FeatureLockedMessage
        feature="SMS Messaging"
        description="Send and receive SMS messages with your customers directly from Torqvoice."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getSmsSettings();
  const settings = result.success && result.data ? result.data : {};

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return <SmsSettingsForm initial={settings} appUrl={appUrl} />;
}
