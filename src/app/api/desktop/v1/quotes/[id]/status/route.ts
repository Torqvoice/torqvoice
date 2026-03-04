import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;
      const { status } = await request.json();

      const quote = await db.quote.findFirst({
        where: { id, organizationId },
      });
      if (!quote) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      await db.quote.updateMany({
        where: { id, organizationId },
        data: { status },
      });

      const updated = await db.quote.findUniqueOrThrow({ where: { id } });
      return NextResponse.json({ quote: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES },
      ],
    },
  );
}
