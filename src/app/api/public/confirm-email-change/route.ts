import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Decode and parse the token
    let payload: { userId: string; email: string; token: string };
    try {
      const decoded = Buffer.from(token, "base64url").toString();
      payload = JSON.parse(decoded);
    } catch {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Look up the verification record
    const verification = await db.verification.findUnique({
      where: { identifier: `email-change:${payload.userId}` },
    });

    if (!verification || verification.value !== token) {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Check expiration
    if (new Date() > verification.expiresAt) {
      await db.verification.delete({
        where: { id: verification.id },
      });
      return NextResponse.redirect(
        new URL("/settings/account?error=token-expired", request.url),
      );
    }

    // Ensure the new email isn't already taken
    const existing = await db.user.findFirst({
      where: { email: payload.email, NOT: { id: payload.userId } },
    });

    if (existing) {
      await db.verification.delete({
        where: { id: verification.id },
      });
      return NextResponse.redirect(
        new URL("/settings/account?error=email-taken", request.url),
      );
    }

    // Update the user's email and mark as verified
    await db.user.update({
      where: { id: payload.userId },
      data: {
        email: payload.email,
        emailVerified: true,
      },
    });

    // Clean up the verification record
    await db.verification.delete({
      where: { id: verification.id },
    });

    return NextResponse.redirect(
      new URL("/settings/account?emailChanged=true", request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings/account?error=unexpected", request.url),
    );
  }
}
