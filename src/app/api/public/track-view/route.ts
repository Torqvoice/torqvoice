import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, token } = body;

    if (!type || !token || !["quote", "invoice"].includes(type)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (type === "quote") {
      const quote = await db.quote.findFirst({
        where: { publicToken: token },
        select: { id: true },
      });
      if (!quote) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await db.quote.update({
        where: { id: quote.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });
    } else {
      const record = await db.serviceRecord.findFirst({
        where: { publicToken: token },
        select: { id: true },
      });
      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await db.serviceRecord.update({
        where: { id: record.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
