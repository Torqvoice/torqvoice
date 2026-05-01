import { redirect } from "next/navigation";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { FeatureLockedMessage } from "../feature-locked-message";
import { getWebhooks } from "@/features/webhooks/Actions/webhookActions";
import { WebhooksSettings } from "./webhooks-settings";

export default async function WebhooksPage() {
  const data = await getLayoutData();
  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);
  if (!features.api) {
    return (
      <FeatureLockedMessage
        feature="Webhooks"
        description="Push real-time event notifications to your own systems via HTTPS."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getWebhooks();
  const webhooks = result.success && result.data ? result.data : [];

  return <WebhooksSettings webhooks={webhooks} />;
}
