import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { recordDeletion } from "@/lib/sync-deletion";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;

      const message = await db.smsMessage.findFirst({
        where: { id, organizationId },
      });
      if (!message) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }

      await recordDeletion("smsMessage", id, organizationId);
      await db.smsMessage.delete({ where: { id } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}
