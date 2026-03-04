import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  return withDesktopAuth(request, async ({ userId, organizationId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    // Get company logo
    let companyLogo: string | null = null;
    const logoSetting = await db.appSetting.findFirst({
      where: { organizationId, key: "workshop.logo" },
      select: { value: true },
    });
    companyLogo = logoSetting?.value || null;

    return NextResponse.json({
      user,
      organization: org ? { ...org, logo: companyLogo } : null,
    });
  });
}

export async function DELETE(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  if (!token || token.length > 256) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only delete if the session is valid and belongs to a real user
  const session = await db.session.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.session.delete({ where: { id: session.id } });

  return new NextResponse(null, { status: 204 });
}
