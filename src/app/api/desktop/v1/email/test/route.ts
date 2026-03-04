import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";

export async function POST(request: Request) {
  return withDesktopAuth(request, async ({ userId, organizationId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      return NextResponse.json({ error: "Could not find your email address" }, { status: 400 });
    }

    const from = await getOrgFromAddress(organizationId);

    await sendOrgMail(organizationId, {
      from,
      to: user.email,
      subject: "Email Test - Torqvoice",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Email Configuration Test</h2>
          <p>This is a test email from your organization's email settings.</p>
          <p>If you're reading this, your email provider is configured correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #6b7280; font-size: 12px;">
            Sent to: ${user.email}<br/>
            Time: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ sentTo: user.email });
  });
}
