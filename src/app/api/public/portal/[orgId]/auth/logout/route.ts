import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;

  if (token) {
    await db.customerSession
      .delete({ where: { token } })
      .catch(() => {});
  }

  cookieStore.delete({
    name: CUSTOMER_SESSION_COOKIE,
    path: "/portal",
  });

  return NextResponse.json({ success: true });
}
