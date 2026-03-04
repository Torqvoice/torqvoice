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

      const payment = await db.payment.findFirst({
        where: { id, serviceRecord: { vehicle: { organizationId } } },
      });
      if (!payment) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }

      await recordDeletion("payment", id, organizationId);
      await db.payment.delete({ where: { id } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.BILLING },
      ],
    },
  );
}
