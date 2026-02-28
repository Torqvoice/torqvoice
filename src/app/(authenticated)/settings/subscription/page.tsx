import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isCloudMode, PLAN_FEATURES, type Plan } from "@/lib/features";
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

  const plan: Plan = subscription?.status === "active" || subscription?.status === "trialing"
    ? (subscription.plan.name.toLowerCase() === "enterprise" ? "enterprise" : "pro")
    : "free";

  const features = PLAN_FEATURES[plan];

  const [customerCount, memberCount] = await Promise.all([
    db.customer.count({
      where: { organizationId: authContext.organizationId },
    }),
    db.organizationMember.count({
      where: { organizationId: authContext.organizationId },
    }),
  ]);

  return (
    <SubscriptionSettings
      plan={plan}
      status={subscription?.status ?? null}
      cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
      currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
      currentPeriodStart={subscription?.currentPeriodStart?.toISOString() ?? null}
      planPrice={subscription?.plan.price ?? 0}
      planInterval={subscription?.plan.interval ?? "year"}
      hasStripeCustomer={!!subscription?.stripeCustomerId}
      usage={{ customers: customerCount, members: memberCount }}
      features={features}
    />
  );
}
