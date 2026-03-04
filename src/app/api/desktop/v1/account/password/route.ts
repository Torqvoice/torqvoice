import { NextResponse } from "next/server";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { auth } from "@/lib/auth";

export async function PUT(request: Request) {
  return withDesktopAuth(request, async ({ userId }) => {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "currentPassword is required" },
        { status: 400 },
      );
    }

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "newPassword is required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    try {
      // Use better-auth's server-side API to change the password.
      // Pass the original Authorization header so better-auth can resolve the session.
      const headers = new Headers();
      const authHeader = request.headers.get("Authorization");
      if (authHeader) {
        headers.set("Authorization", authHeader);
      }

      const result = await auth.api.changePassword({
        body: { currentPassword, newPassword },
        headers,
      });

      if (!result) {
        return NextResponse.json(
          { error: "Password change failed" },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Password change failed";

      // better-auth throws when the current password is wrong
      if (
        message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("incorrect") ||
        message.toLowerCase().includes("wrong")
      ) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }

      console.error("[desktop-api] password change error:", err);
      return NextResponse.json(
        { error: "Password change failed" },
        { status: 500 },
      );
    }
  });
}
