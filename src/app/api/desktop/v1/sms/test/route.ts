import { NextResponse } from "next/server";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { sendOrgSms } from "@/lib/sms";

export async function POST(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const body = await request.json();
    const { phone } = body;

    if (!phone?.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    await sendOrgSms(organizationId, {
      to: phone.trim(),
      body: "SMS test from Torqvoice — your SMS provider is configured correctly.",
    });

    return NextResponse.json({ sentTo: phone.trim() });
  });
}
