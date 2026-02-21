import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ORG_SMS_KEYS } from "@/features/sms/Schema/smsSettingsSchema";
import { notify } from "@/lib/notify";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const orgSecret = url.searchParams.get("org_secret");

    if (!orgSecret) {
      return NextResponse.json({ error: "Missing org_secret" }, { status: 400 });
    }

    const secretSetting = await db.appSetting.findFirst({
      where: {
        key: ORG_SMS_KEYS.SMS_WEBHOOK_SECRET,
        value: orgSecret,
      },
      select: { organizationId: true },
    });

    if (!secretSetting?.organizationId) {
      return NextResponse.json({ error: "Invalid org_secret" }, { status: 403 });
    }

    const organizationId = secretSetting.organizationId;

    // Vonage sends JSON
    const payload = (await request.json()) as {
      msisdn?: string;
      to?: string;
      text?: string;
      messageId?: string;
    };

    const from = payload.msisdn || "";
    const to = payload.to || "";
    const body = payload.text || "";
    const messageId = payload.messageId;

    if (!from || !body) {
      return NextResponse.json({ received: true });
    }

    const customer = await db.customer.findFirst({
      where: { organizationId, phone: from },
      select: { id: true, name: true },
    });

    const message = await db.smsMessage.create({
      data: {
        direction: "inbound",
        fromNumber: from,
        toNumber: to,
        body,
        status: "received",
        providerMsgId: messageId || undefined,
        organizationId,
        customerId: customer?.id,
      },
    });

    await notify({
      organizationId,
      type: "sms_inbound",
      title: "New SMS received",
      message: customer
        ? `${customer.name}: ${body.slice(0, 100)}`
        : `${from}: ${body.slice(0, 100)}`,
      entityType: "sms_message",
      entityId: message.id,
      entityUrl: customer
        ? `/customers/${customer.id}?tab=messages`
        : "/settings/sms",
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook/sms/vonage] Error:", error);
    return NextResponse.json({ received: true });
  }
}
