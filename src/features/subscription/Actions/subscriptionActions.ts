"use server";

import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe-config";

export async function cancelSubscription() {
  return withAuth(async ({ organizationId }) => {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    const stripe = await getStripeClient();

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true },
    });

    return { cancelAtPeriodEnd: true };
  });
}

export async function resumeSubscription() {
  return withAuth(async ({ organizationId }) => {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    const stripe = await getStripeClient();

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await db.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: false },
    });

    return { cancelAtPeriodEnd: false };
  });
}
