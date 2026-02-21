import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { redirect } from "next/navigation";
import { getRecentSmsThreads } from "@/features/sms/Actions/smsActions";
import { MessagesPageClient } from "@/features/sms/Components/MessagesPageClient";
import { PageHeader } from "@/components/page-header";

export default async function MessagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/sign-in");

  const features = await getFeatures(ctx.organizationId);
  if (!features.sms) {
    redirect("/");
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
        <MessagesPageClient initialThreads={threads} initialHasMore={hasMore} />
      </div>
    </>
  );
}
