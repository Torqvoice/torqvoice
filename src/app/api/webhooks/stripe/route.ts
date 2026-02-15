import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";

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

    // We need to determine which org this webhook belongs to.
    // Parse the event without verification first to get orgId from metadata,
    // then verify with the org's webhook secret.
    let unverifiedEvent: Stripe.Event;
    try {
      unverifiedEvent = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 },
      );
    }

    if (unverifiedEvent.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = (unverifiedEvent.data as Stripe.Event.Data)
      .object as Stripe.Checkout.Session;
    const orgId = session.metadata?.orgId;
    const serviceRecordId = session.metadata?.serviceRecordId;

    if (!orgId || !serviceRecordId) {
      return NextResponse.json(
        { error: "Missing metadata" },
        { status: 400 },
      );
    }

    // Load org's webhook secret and verify
    const webhookSecretSetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET,
        },
      },
    });

    const secretKeySetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY,
        },
      },
    });

    if (!secretKeySetting?.value) {
      return NextResponse.json(
        { error: "Stripe not configured for this org" },
        { status: 400 },
      );
    }

    // Verify webhook signature if webhook secret is configured
    if (webhookSecretSetting?.value) {
      const stripe = new Stripe(secretKeySetting.value);
      try {
        stripe.webhooks.constructEvent(
          body,
          signature,
          webhookSecretSetting.value,
        );
      } catch {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 },
        );
      }
    }

    // Verify the session is actually paid
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    // Idempotent: check if payment already recorded
    const existing = await db.payment.findFirst({
      where: { externalId: session.id },
    });

    if (!existing) {
      // Verify service record exists and belongs to this org
      const record = await db.serviceRecord.findUnique({
        where: { id: serviceRecordId },
        include: { vehicle: { select: { organizationId: true } } },
      });

      if (record && record.vehicle.organizationId === orgId) {
        await db.payment.create({
          data: {
            amount: (session.amount_total ?? 0) / 100,
            method: "stripe",
            provider: "stripe",
            externalId: session.id,
            serviceRecordId,
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
