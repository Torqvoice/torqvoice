import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [deletedSessions, deletedLinks] = await Promise.all([
    db.customerSession.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    db.customerMagicLink.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { usedAt: { not: null } },
        ],
      },
    }),
  ]);

  return NextResponse.json({
    deletedSessions: deletedSessions.count,
    deletedLinks: deletedLinks.count,
    timestamp: now.toISOString(),
  });
}
