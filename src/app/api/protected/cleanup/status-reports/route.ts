import { NextResponse } from "next/server";
import { cleanupExpiredReports } from "@/features/status-reports/Actions/cleanupExpiredReports";
import { getAuthContext } from "@/lib/get-auth-context";

export async function POST() {
  // Require authentication - only admins/super admins should call this
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupExpiredReports();
  return NextResponse.json(result);
}
