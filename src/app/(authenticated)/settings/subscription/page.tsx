import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isCloudMode } from "@/lib/features";
import { SubscriptionSettings } from "@/features/subscription/Components/subscription-settings";

export default async function SubscriptionPage() {
  if (!isCloudMode()) {
    redirect("/settings");
  }

  const authContext = await getAuthContext();
  if (!authContext) redirect("/auth/sign-in");

  const subscription = await db.subscription.findUnique({
    where: { organizationId: authContext.organizationId },
    include: { plan: true },
  });

  const plan = subscription?.status === "active"
    ? (subscription.plan.name.toLowerCase() === "enterprise" ? "enterprise" : "pro")
    : "free";

  return (
    <SubscriptionSettings
      plan={plan}
      status={subscription?.status ?? null}
      cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
      currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
    />
  );
}
