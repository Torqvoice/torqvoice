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

    // Look up org by webhook secret
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

    // Parse Twilio form-encoded payload
    const formData = await request.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    if (!from || !body) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response/>',
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // Match incoming phone number to a customer
    const customer = await db.customer.findFirst({
      where: { organizationId, phone: from },
      select: { id: true, name: true },
    });

    // Create inbound SMS record
    const message = await db.smsMessage.create({
      data: {
        direction: "inbound",
        fromNumber: from,
        toNumber: to || "",
        body,
        status: "received",
        providerMsgId: messageSid || undefined,
        organizationId,
        customerId: customer?.id,
      },
    });

    // Send in-app notification
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
        ? `/messages?customerId=${customer.id}`
        : "/settings/sms",
    });

    // Return TwiML empty response
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response/>',
      { headers: { "Content-Type": "text/xml" } },
    );
  } catch (error) {
    console.error("[webhook/sms/twilio] Error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response/>',
      { headers: { "Content-Type": "text/xml" } },
    );
  }
}
