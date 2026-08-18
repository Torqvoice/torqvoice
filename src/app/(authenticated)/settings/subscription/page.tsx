import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isCloudMode, PLAN_FEATURES, type Plan } from "@/lib/features";
import { isTrialEligible } from "@/lib/subscription-trial";
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

  // "trialing" covers two cases: an admin-granted demo (no Stripe subscription
  // behind it, granted from the admin panel) and a self-serve 14-day free
  // trial started through Stripe Checkout (has a stripeSubscriptionId, card on
  // file, converts to a paid subscription automatically at trial end).
  const isDemo =
    subscription?.status === "trialing" && !subscription?.stripeSubscriptionId;

  // Orgs that never had a subscription can start a 14-day free trial.
  const trialEligible = await isTrialEligible(authContext.organizationId);

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
      isDemo={isDemo}
      trialEligible={trialEligible}
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
