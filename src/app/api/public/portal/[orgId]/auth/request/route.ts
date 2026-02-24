import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { MAGIC_LINK_DURATION } from "@/lib/customer-session";
import { resolvePortalOrg } from "@/lib/portal-slug";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const rateLimitResponse = rateLimit(request, { limit: 5, windowMs: 60_000 });
  if (rateLimitResponse) return rateLimitResponse;

  const { orgId: orgParam } = await params;

  try {
    const body = await request.json();
    const email = (body.email as string)?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    // Resolve slug or id to real org
    const org = await resolvePortalOrg(orgParam);

    if (!org) {
      // Don't leak org existence - return generic success
      return NextResponse.json({ success: true });
    }

    const orgId = org.id;

    // Check portal is enabled
    const portalSetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: SETTING_KEYS.PORTAL_ENABLED,
        },
      },
    });

    if (portalSetting?.value !== "true") {
      return NextResponse.json({ success: true });
    }

    // Look up customer
    const customer = await db.customer.findFirst({
      where: {
        email,
        organizationId: orgId,
      },
      select: { id: true, name: true },
    });

    if (!customer) {
      // Don't leak customer existence
      return NextResponse.json({ success: true });
    }

    // Create magic link
    const token = randomBytes(32).toString("hex");
    await db.customerMagicLink.create({
      data: {
        token,
        email,
        organizationId: orgId,
        expiresAt: new Date(Date.now() + MAGIC_LINK_DURATION),
      },
    });

    // Send email - use the URL param (slug) so the verify link matches the user's URL
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const magicLinkUrl = `${appUrl}/portal/${orgParam}/auth/verify?token=${token}`;
    const fromAddress = await getOrgFromAddress(orgId);

    await sendOrgMail(orgId, {
      from: fromAddress,
      to: email,
      subject: `Sign in to ${org.name} portal`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Sign in to ${org.name}</h2>
          <p>Hi ${customer.name},</p>
          <p>Click the button below to sign in to your customer portal:</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${magicLinkUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Sign In
            </a>
          </p>
          <p style="color: #64748b; font-size: 14px;">This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[portal-auth-request]", error);
    return NextResponse.json({ success: true });
  }
}
