import { Suspense } from "react";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures, isCloudMode } from "@/lib/features";
import { redirect } from "next/navigation";
import { getRecentSmsThreads } from "@/features/sms/Actions/smsActions";
import { getSmsSettings } from "@/features/sms/Actions/smsSettingsActions";
import { MessagesPageClient } from "@/features/sms/Components/MessagesPageClient";
import { PageHeader } from "@/components/page-header";
import { FeatureLockedMessage } from "../settings/feature-locked-message";
import { SmsNotConfiguredMessage } from "./sms-not-configured-message";

export default async function MessagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/sign-in");

  const features = await getFeatures(ctx.organizationId);

  if (!features.sms) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <FeatureLockedMessage
            feature="SMS Messaging"
            description="Send and receive SMS messages with your customers directly from Torqvoice."
            isCloud={isCloudMode()}
          />
        </div>
      </>
    );
  }

  const settingsResult = await getSmsSettings();
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const hasProvider = !!settings["sms.provider"];

  if (!hasProvider) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <SmsNotConfiguredMessage />
        </div>
      </>
    );
  }

  const threadsResult = await getRecentSmsThreads();
  const threads =
    threadsResult.success && threadsResult.data ? threadsResult.data.threads : [];
  const hasMore =
    threadsResult.success && threadsResult.data ? threadsResult.data.hasMore : false;

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <Suspense>
          <MessagesPageClient initialThreads={threads} initialHasMore={hasMore} />
        </Suspense>
      </div>
    </>
  );
}
