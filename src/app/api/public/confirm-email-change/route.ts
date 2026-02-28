import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const uid = request.nextUrl.searchParams.get("uid");

    if (!token || !uid) {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Look up the verification record by userId
    const verification = await db.verification.findUnique({
      where: { identifier: `email-change:${uid}` },
    });

    if (!verification) {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Check expiration first
    if (new Date() > verification.expiresAt) {
      await db.verification.delete({
        where: { id: verification.id },
      });
      return NextResponse.redirect(
        new URL("/settings/account?error=token-expired", request.url),
      );
    }

    // Parse stored data
    let stored: { tokenHash: string; email: string };
    try {
      stored = JSON.parse(verification.value);
    } catch {
      await db.verification.delete({
        where: { id: verification.id },
      });
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Hash the provided token and compare using timing-safe comparison
    const providedHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const storedHashBuffer = Buffer.from(stored.tokenHash, "hex");
    const providedHashBuffer = Buffer.from(providedHash, "hex");

    if (
      storedHashBuffer.length !== providedHashBuffer.length ||
      !crypto.timingSafeEqual(storedHashBuffer, providedHashBuffer)
    ) {
      return NextResponse.redirect(
        new URL("/settings/account?error=invalid-token", request.url),
      );
    }

    // Ensure the new email isn't already taken
    const existing = await db.user.findFirst({
      where: { email: stored.email, NOT: { id: uid } },
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
    await db.$transaction([
      db.user.update({
        where: { id: uid },
        data: {
          email: stored.email,
          emailVerified: true,
        },
      }),
      db.verification.delete({
        where: { id: verification.id },
      }),
    ]);

    return NextResponse.redirect(
      new URL("/settings/account?emailChanged=true", request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings/account?error=unexpected", request.url),
    );
  }
}
