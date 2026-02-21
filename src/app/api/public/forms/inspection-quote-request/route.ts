import { NextResponse } from "next/server";
import { createQuoteRequest, cancelQuoteRequest } from "@/features/inspections/Actions/quoteRequestActions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createQuoteRequest(body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quote request";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const result = await cancelQuoteRequest(body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel quote request";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
