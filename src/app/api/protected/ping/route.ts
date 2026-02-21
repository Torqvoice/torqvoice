import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });

  await db.user.update({
    where: { id: session.user.id },
    data: { lastSeen: new Date() },
  });

  return NextResponse.json({ ok: true });
}
