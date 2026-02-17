import { getEmailSettings } from "@/features/email/Actions/emailSettingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { EmailSettingsForm } from "@/features/email/Components/EmailSettingsForm";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function EmailSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.smtp) {
    return (
      <FeatureLockedMessage
        feature="Email Settings"
        description="Configure SMTP email sending to deliver invoices, quotes, and notifications directly from your workshop."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getEmailSettings();
  const settings = result.success && result.data ? result.data : {};

  return <EmailSettingsForm initial={settings} />;
}
