import { NextResponse } from "next/server";
import { respondToQuote } from "@/features/quotes/Actions/quoteResponseActions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await respondToQuote(body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process quote response";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
