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

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        type: "subscription",
        plan,
        organizationId: membership.organizationId,
      },
      subscription_data: {
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
