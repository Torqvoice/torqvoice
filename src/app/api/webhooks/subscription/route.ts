import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient, getStripeConfig } from "@/lib/stripe-config";
import { notify } from "@/lib/notify";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    const config = await getStripeConfig();
    if (!config.webhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    const stripe = await getStripeClient();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
    } catch {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 },
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.type !== "subscription") {
          return NextResponse.json({ received: true });
        }

        const organizationId = session.metadata.organizationId;
        const plan = session.metadata.plan;

        if (!organizationId || !plan) {
          return NextResponse.json(
            { error: "Missing metadata" },
            { status: 400 },
          );
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) {
          return NextResponse.json(
            { error: "No subscription ID in session" },
            { status: 400 },
          );
        }

        // Fetch full subscription to get period dates
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Find or create the plan record
        const stripePriceId = plan === "pro" ? config.proPriceId : config.enterprisePriceId;
        const subscriptionPlan = await db.subscriptionPlan.upsert({
          where: { stripePriceId: stripePriceId || "unknown" },
          create: {
            name: plan === "pro" ? "Torq Pro" : "Enterprise",
            stripePriceId: stripePriceId || null,
            price: plan === "pro" ? 99 : 140,
            interval: "year",
            maxMembers: plan === "pro" ? 5 : 50,
          },
          update: {},
        });

        const currentItem = subscription.items.data[0];

        // A checkout with a free trial produces a "trialing" subscription;
        // record it as such so the UI can show trial status. Stripe flips it
        // to "active" at trial end (handled by customer.subscription.updated
        // and the nightly reconcile).
        const initialStatus =
          subscription.status === "trialing" ? "trialing" : "active";

        await db.subscription.upsert({
          where: { organizationId },
          create: {
            organizationId,
            planId: subscriptionPlan.id,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId:
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer?.id ?? null,
            status: initialStatus,
            currentPeriodStart: currentItem?.current_period_start
              ? new Date(currentItem.current_period_start * 1000)
              : null,
            currentPeriodEnd: currentItem?.current_period_end
              ? new Date(currentItem.current_period_end * 1000)
              : null,
          },
          update: {
            planId: subscriptionPlan.id,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId:
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer?.id ?? null,
            status: initialStatus,
            currentPeriodStart: currentItem?.current_period_start
              ? new Date(currentItem.current_period_start * 1000)
              : null,
            currentPeriodEnd: currentItem?.current_period_end
              ? new Date(currentItem.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: false,
          },
        });

        // Update the license plan in system settings
        const orgMember = await db.organizationMember.findFirst({
          where: { organizationId },
          select: { userId: true },
        });

        if (orgMember) {
          await db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key: "license.plan" } },
            create: {
              organizationId,
              key: "license.plan",
              value: plan,
              userId: orgMember.userId,
            },
            update: { value: plan },
          });
        }

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await db.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (!existing) {
          return NextResponse.json({ received: true });
        }

        const currentItem = subscription.items.data[0];

        await db.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: subscription.status === "active" ? "active" : subscription.status,
            currentPeriodStart: currentItem?.current_period_start
              ? new Date(currentItem.current_period_start * 1000)
              : null,
            currentPeriodEnd: currentItem?.current_period_end
              ? new Date(currentItem.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await db.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
          select: { organizationId: true },
        });

        if (existing) {
          await db.subscription.update({
            where: { stripeSubscriptionId: subscription.id },
            data: { status: "canceled" },
          });

          // Downgrade license plan
          const member = await db.organizationMember.findFirst({
            where: { organizationId: existing.organizationId },
            select: { userId: true },
          });

          if (member) {
            await db.appSetting.upsert({
              where: {
                organizationId_key: {
                  organizationId: existing.organizationId,
                  key: "license.plan",
                },
              },
              create: {
                organizationId: existing.organizationId,
                key: "license.plan",
                value: "free",
                userId: member.userId,
              },
              update: { value: "free" },
            });
          }
        }

        break;
      }

      case "customer.subscription.trial_will_end": {
        // Stripe sends this 3 days before the trial ends. Warn the org in-app
        // that the full plan price will be charged automatically.
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await db.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
          include: { plan: true },
        });

        if (!existing || existing.status !== "trialing") {
          return NextResponse.json({ received: true });
        }

        // Idempotent: Stripe may redeliver the event.
        const alreadyNotified = await db.notification.findFirst({
          where: {
            organizationId: existing.organizationId,
            type: "subscription_trial_ending",
            entityId: existing.id,
          },
          select: { id: true },
        });

        if (!alreadyNotified) {
          const trialEnd = subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : existing.currentPeriodEnd;
          const chargeDate = trialEnd
            ? trialEnd.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "soon";
          const interval = existing.plan.interval === "month" ? "month" : "year";

          await notify({
            organizationId: existing.organizationId,
            type: "subscription_trial_ending",
            title: "Your free trial ends in 3 days",
            message: `Your card will be charged $${existing.plan.price}/${interval} for the ${existing.plan.name} plan on ${chargeDate}. Cancel before then in Settings > Subscription to avoid the charge.`,
            entityType: "subscription",
            entityId: existing.id,
            entityUrl: "/settings/subscription",
          });
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : null;

        if (subscriptionId) {
          const existing = await db.subscription.findUnique({
            where: { stripeSubscriptionId: subscriptionId },
          });

          if (existing) {
            await db.subscription.update({
              where: { stripeSubscriptionId: subscriptionId },
              data: { status: "past_due" },
            });
          }
        }

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Subscription Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
