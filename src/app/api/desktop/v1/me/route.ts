import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const session = await db.session.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Get active organization
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.userId },
    select: {
      organization: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    user,
    organization: membership?.organization ?? null,
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

  await db.session.deleteMany({ where: { token } });

  return new NextResponse(null, { status: 204 });
}
