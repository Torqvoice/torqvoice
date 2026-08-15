import { Suspense } from "react";
import { getAuthContext } from "@/lib/get-auth-context";
import { redirect } from "next/navigation";
import { getRecentSmsThreads } from "@/features/sms/Actions/smsActions";
import { getSmsSettings } from "@/features/sms/Actions/smsSettingsActions";
import { getFeatures } from "@/lib/features";
import { getScheduledMessages } from "@/features/scheduled-messages/Actions/scheduledMessageActions";
import { getAvailableChannels } from "@/features/scheduled-messages/Lib/availableChannels";
import { MessagesPageClient } from "@/features/sms/Components/MessagesPageClient";
import { PageHeader } from "@/components/page-header";

export default async function MessagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/sign-in");

  const features = await getFeatures(ctx.organizationId);

  // The inbox needs SMS on the plan and a provider set up; scheduled messages
  // only need email, so the page itself stays open either way and the inbox
  // tab explains what is missing.
  const settingsResult = features.sms ? await getSmsSettings() : null;
  const settings = settingsResult?.success && settingsResult.data ? settingsResult.data : {};
  const smsConfigured = !!features.sms && !!settings["sms.provider"];

  const [threadsResult, scheduledResult, messageChannels] = await Promise.all([
    smsConfigured ? getRecentSmsThreads() : Promise.resolve(null),
    getScheduledMessages(),
    getAvailableChannels(ctx.organizationId),
  ]);

  const threads =
    threadsResult?.success && threadsResult.data ? threadsResult.data.threads : [];
  const hasMore =
    threadsResult?.success && threadsResult.data ? threadsResult.data.hasMore : false;
  const scheduled =
    scheduledResult.success && scheduledResult.data ? scheduledResult.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <Suspense>
          <MessagesPageClient
            initialThreads={threads}
            initialHasMore={hasMore}
            initialScheduled={scheduled}
            availableChannels={messageChannels}
            smsConfigured={smsConfigured}
          />
        </Suspense>
      </div>
    </>
  );
}
