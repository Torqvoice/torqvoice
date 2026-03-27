import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredReports } from "@/features/status-reports/Actions/cleanupExpiredReports";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Require CRON_SECRET env var for security
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupExpiredReports();
  return NextResponse.json(result);
}
