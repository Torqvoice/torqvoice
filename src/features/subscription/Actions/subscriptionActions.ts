"use server";

import Stripe from "stripe";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export async function cancelSubscription() {
  return withAuth(async ({ organizationId }) => {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    const stripe = getStripe();

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

    const stripe = getStripe();

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
