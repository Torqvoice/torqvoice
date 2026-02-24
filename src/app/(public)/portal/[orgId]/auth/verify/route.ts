import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION,
} from "@/lib/customer-session";
import { resolvePortalOrg } from "@/lib/portal-slug";

function getBaseUrl(requestUrl: string): string {
  // Prefer configured app URL, fall back to request origin
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(requestUrl).origin;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId: orgParam } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const baseUrl = getBaseUrl(request.url);

  const loginUrl = `${baseUrl}/portal/${orgParam}/auth/login`;

  if (!token) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Missing verification token.")}`,
    );
  }

  // Resolve slug/id to real org
  const org = await resolvePortalOrg(orgParam);
  if (!org) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Invalid or expired link.")}`,
    );
  }

  const orgId = org.id;

  // Look up magic link
  const magicLink = await db.customerMagicLink.findUnique({
    where: { token },
  });

  if (!magicLink || magicLink.organizationId !== orgId) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Invalid or expired link.")}`,
    );
  }

  if (magicLink.usedAt) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("This link has already been used. Please request a new one.")}`,
    );
  }

  if (new Date() > magicLink.expiresAt) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("This link has expired. Please request a new one.")}`,
    );
  }

  // Mark magic link as used
  await db.customerMagicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  // Find customer
  const customer = await db.customer.findFirst({
    where: {
      email: magicLink.email,
      organizationId: orgId,
    },
    select: { id: true },
  });

  if (!customer) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Customer account not found.")}`,
    );
  }

  // Create session
  const sessionToken = randomBytes(32).toString("hex");
  await db.customerSession.create({
    data: {
      token: sessionToken,
      customerId: customer.id,
      organizationId: orgId,
      expiresAt: new Date(Date.now() + CUSTOMER_SESSION_DURATION),
    },
  });

  // Set cookie and redirect to dashboard
  const response = NextResponse.redirect(
    `${baseUrl}/portal/${orgParam}/dashboard`,
  );

  response.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: CUSTOMER_SESSION_DURATION / 1000,
  });

  return response;
}
