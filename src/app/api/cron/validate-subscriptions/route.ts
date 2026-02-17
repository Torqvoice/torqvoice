import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/features";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/**
 * Map Stripe subscription status to our internal status.
 * Stripe statuses: active, past_due, unpaid, canceled, incomplete,
 *                  incomplete_expired, trialing, paused
 * Our statuses:    active, past_due, canceled, trialing
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    // All terminal / non-active states map to canceled
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused":
    case "incomplete":
      return "canceled";
    default:
      return "canceled";
  }
}

/**
 * Determine the license plan name from the subscription state.
 * Returns "free" if the subscription is not in a paying state.
 */
function resolveLicensePlan(
  internalStatus: string,
  planName: string,
): string {
  if (internalStatus !== "active" && internalStatus !== "trialing") {
    return "free";
  }
  const lower = planName.toLowerCase();
  if (lower.includes("enterprise")) return "enterprise";
  if (lower.includes("pro")) return "pro";
  return "free";
}

type ValidationResult = {
  subscriptionId: string;
  organizationId: string;
  stripeSubscriptionId: string;
  previousStatus: string;
  newStatus: string;
  action: "synced" | "unchanged" | "stripe_missing" | "error";
  error?: string;
};

export async function GET(request: Request) {
  // --- Auth ---
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Guard: only run in cloud mode ---
  if (!isCloudMode()) {
    return NextResponse.json({
      skipped: true,
      reason: "Not in cloud mode",
      timestamp: new Date().toISOString(),
    });
  }

  // --- Guard: Stripe must be configured ---
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not configured" },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  const results: ValidationResult[] = [];

  // Fetch all subscriptions that are not already in a terminal state.
  // We validate: active (may have expired), past_due (may have been paid or
  // canceled), and trialing (may have converted or expired).
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["active", "past_due", "trialing"] },
      stripeSubscriptionId: { not: null },
    },
    include: { plan: true },
  });

  for (const sub of subscriptions) {
    const result: ValidationResult = {
      subscriptionId: sub.id,
      organizationId: sub.organizationId,
      stripeSubscriptionId: sub.stripeSubscriptionId!,
      previousStatus: sub.status,
      newStatus: sub.status,
      action: "unchanged",
    };

    try {
      // Fetch the authoritative state from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(
        sub.stripeSubscriptionId!,
      );

      const newStatus = mapStripeStatus(stripeSub.status);
      const currentItem = stripeSub.items.data[0];
      const periodStart = currentItem?.current_period_start
        ? new Date(currentItem.current_period_start * 1000)
        : null;
      const periodEnd = currentItem?.current_period_end
        ? new Date(currentItem.current_period_end * 1000)
        : null;
      const cancelAtPeriodEnd = stripeSub.cancel_at_period_end;

      // Detect if anything has drifted
      const statusChanged = sub.status !== newStatus;
      const periodEndChanged =
        periodEnd?.getTime() !== sub.currentPeriodEnd?.getTime();
      const periodStartChanged =
        periodStart?.getTime() !== sub.currentPeriodStart?.getTime();
      const cancelChanged = sub.cancelAtPeriodEnd !== cancelAtPeriodEnd;

      if (
        statusChanged ||
        periodEndChanged ||
        periodStartChanged ||
        cancelChanged
      ) {
        const licensePlan = resolveLicensePlan(newStatus, sub.plan.name);

        // Update subscription record and license.plan in a transaction
        await db.$transaction([
          db.subscription.update({
            where: { id: sub.id },
            data: {
              status: newStatus,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd,
            },
          }),
          db.appSetting.upsert({
            where: {
              organizationId_key: {
                organizationId: sub.organizationId,
                key: "license.plan",
              },
            },
            create: {
              organizationId: sub.organizationId,
              key: "license.plan",
              value: licensePlan,
              userId: "",
            },
            update: { value: licensePlan },
          }),
        ]);

        result.newStatus = newStatus;
        result.action = "synced";
      }
    } catch (error) {
      // Stripe resource_missing means the subscription was deleted on Stripe's
      // side but we never got the webhook. Downgrade it.
      if (
        error instanceof Stripe.errors.StripeError &&
        error.code === "resource_missing"
      ) {
        try {
          await db.$transaction([
            db.subscription.update({
              where: { id: sub.id },
              data: { status: "canceled" },
            }),
            db.appSetting.upsert({
              where: {
                organizationId_key: {
                  organizationId: sub.organizationId,
                  key: "license.plan",
                },
              },
              create: {
                organizationId: sub.organizationId,
                key: "license.plan",
                value: "free",
                userId: "",
              },
              update: { value: "free" },
            }),
          ]);

          result.newStatus = "canceled";
          result.action = "stripe_missing";
        } catch (dbError) {
          result.action = "error";
          result.error =
            dbError instanceof Error
              ? dbError.message
              : "Failed to cancel orphaned subscription";
          console.error(
            `[cron:validate-subscriptions] DB error for orphaned sub ${sub.id}:`,
            dbError,
          );
        }
      } else {
        result.action = "error";
        result.error =
          error instanceof Error ? error.message : "Stripe API error";
        console.error(
          `[cron:validate-subscriptions] Stripe error for sub ${sub.id}:`,
          error,
        );
      }
    }

    results.push(result);
  }

  const synced = results.filter((r) => r.action === "synced").length;
  const errors = results.filter((r) => r.action === "error").length;
  const missing = results.filter((r) => r.action === "stripe_missing").length;

  return NextResponse.json({
    processed: results.length,
    synced,
    errors,
    stripeMissing: missing,
    results,
    timestamp: new Date().toISOString(),
  });
}
