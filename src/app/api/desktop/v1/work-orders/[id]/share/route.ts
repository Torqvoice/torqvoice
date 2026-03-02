import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
      });

      if (!record) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      // If already has a public token, return it
      if (record.publicToken) {
        return NextResponse.json({ token: record.publicToken, organizationId });
      }

      const token = randomUUID();
      await db.serviceRecord.update({
        where: { id },
        data: { publicToken: token, sharedAt: new Date() },
      });

      return NextResponse.json({ token, organizationId });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
      });

      if (!record) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      await db.serviceRecord.update({
        where: { id },
        data: { publicToken: null, sharedAt: null, viewCount: 0, lastViewedAt: null },
      });

      return NextResponse.json({ revoked: true });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
