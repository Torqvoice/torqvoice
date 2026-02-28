import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
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

export async function POST() {
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

    const subscription = await db.subscription.findUnique({
      where: { organizationId: membership.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const stripe = getStripe();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings/subscription`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("[Billing Portal] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create billing portal session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
