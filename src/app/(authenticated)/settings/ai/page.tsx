import { getAiSettings } from "@/features/ai/Actions/aiSettingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { AiSettingsForm } from "@/features/ai/Components/AiSettingsForm";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function AiSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.ai) {
    return (
      <FeatureLockedMessage
        feature="AI Assistant"
        description="Use AI to auto-generate service descriptions, summarize vehicle history, and build quotes from plain text."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getAiSettings();
  const settings = result.success && result.data ? result.data : {};

  return <AiSettingsForm initial={settings} />;
}
