import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getStripeClient, getStripeConfig } from "@/lib/stripe-config";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
      select: { organizationId: true },
    });

    if (!membership?.organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const plan = body.plan as string;

    if (plan !== "enterprise") {
      return NextResponse.json(
        { error: "Can only upgrade to enterprise" },
        { status: 400 },
      );
    }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: membership.organizationId },
      include: { plan: true },
    });

    if (!subscription?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 },
      );
    }

    if (subscription.status !== "active") {
      return NextResponse.json(
        { error: "Subscription is not active" },
        { status: 400 },
      );
    }

    const config = await getStripeConfig();
    const newPriceId = config.enterprisePriceId;

    if (!newPriceId) {
      return NextResponse.json(
        { error: "Enterprise price ID not configured" },
        { status: 500 },
      );
    }

    const stripe = await getStripeClient();

    // Retrieve the current subscription to get the item ID
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );

    const currentItem = stripeSubscription.items.data[0];
    if (!currentItem) {
      return NextResponse.json(
        { error: "No subscription item found" },
        { status: 400 },
      );
    }

    // Update the subscription with the new price, prorating immediately
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: "always_invoice",
        metadata: {
          plan,
          organizationId: membership.organizationId,
        },
      },
    );

    // Update local DB
    const stripePriceId = newPriceId;
    const subscriptionPlan = await db.subscriptionPlan.upsert({
      where: { stripePriceId },
      create: {
        name: "Enterprise",
        stripePriceId,
        price: 140,
        interval: "year",
        maxMembers: 50,
      },
      update: {},
    });

    const updatedItem = updated.items.data[0];

    await db.subscription.update({
      where: { organizationId: membership.organizationId },
      data: {
        planId: subscriptionPlan.id,
        status: "active",
        currentPeriodStart: updatedItem?.current_period_start
          ? new Date(updatedItem.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: updatedItem?.current_period_end
          ? new Date(updatedItem.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: false,
      },
    });

    // Update the license plan
    await db.appSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: membership.organizationId,
          key: "license.plan",
        },
      },
      create: {
        organizationId: membership.organizationId,
        key: "license.plan",
        value: plan,
        userId: "",
      },
      update: { value: plan },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Subscription Upgrade] Error:", error);
    const message =
      error instanceof Error ? error.message : "Upgrade failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
