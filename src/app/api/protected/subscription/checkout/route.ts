import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getStripeClient, getStripeConfig } from "@/lib/stripe-config";
import { isDemoMode } from "@/lib/demo";
import { isTrialEligible, TRIAL_PERIOD_DAYS } from "@/lib/subscription-trial";

export async function POST(request: Request) {
  try {
    if (isDemoMode) {
      return NextResponse.json({ error: "This action is disabled on the demo." }, { status: 403 });
    }

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

    if (plan !== "pro" && plan !== "enterprise") {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'pro' or 'enterprise'" },
        { status: 400 },
      );
    }

    const config = await getStripeConfig();
    const priceId =
      plan === "pro" ? config.proPriceId : config.enterprisePriceId;

    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price ID not configured for ${plan} plan` },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const stripe = await getStripeClient();

    // First-time subscribers get a 14-day free trial. The card is collected
    // up front ($0 due today) and Stripe automatically charges the full plan
    // price when the trial ends. If the payment method somehow goes missing,
    // the subscription cancels instead of charging.
    const trialEligible = await isTrialEligible(membership.organizationId);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      metadata: {
        type: "subscription",
        plan,
        organizationId: membership.organizationId,
      },
      subscription_data: {
        ...(trialEligible
          ? {
              trial_period_days: TRIAL_PERIOD_DAYS,
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" },
              },
            }
          : {}),
        metadata: {
          plan,
          organizationId: membership.organizationId,
        },
      },
      success_url: `${appUrl}/settings/subscription?subscription=success`,
      cancel_url: `${appUrl}/settings/subscription`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[Subscription Checkout] Error:", error);
    const message =
      error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
