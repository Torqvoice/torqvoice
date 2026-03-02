import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateServiceSchema } from "@/features/vehicles/Schema/serviceSchema";
import { recordDeletion } from "@/lib/sync-deletion";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const workOrder = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
        include: {
          partItems: true,
          laborItems: true,
          attachments: true,
          payments: true,
          vehicle: { include: { customer: true } },
        },
      });

      if (!workOrder) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      return NextResponse.json({ workOrder });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const body = await request.json();
      const { id: _schemaId, partItems, laborItems, ...recordData } = updateServiceSchema.parse({ ...body, id });

      const existing = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
      });
      if (!existing) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      const workOrder = await db.$transaction(async (tx) => {
        const updated = await tx.serviceRecord.update({
          where: { id },
          data: {
            ...recordData,
            description: recordData.description !== undefined ? (recordData.description || null) : undefined,
            techName: recordData.techName !== undefined ? (recordData.techName || null) : undefined,
            diagnosticNotes: recordData.diagnosticNotes !== undefined ? (recordData.diagnosticNotes || null) : undefined,
            invoiceNotes: recordData.invoiceNotes !== undefined ? (recordData.invoiceNotes || null) : undefined,
            invoiceNumber: recordData.invoiceNumber !== undefined ? (recordData.invoiceNumber || null) : undefined,
            mileage: recordData.mileage !== undefined ? (recordData.mileage ?? null) : undefined,
            serviceDate: recordData.serviceDate ? new Date(recordData.serviceDate) : undefined,
          },
        });

        if (partItems !== undefined) {
          await tx.servicePart.deleteMany({ where: { serviceRecordId: id } });
          if (partItems.length > 0) {
            await tx.servicePart.createMany({
              data: partItems.map((p) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { inventoryPartId: _inv, ...partData } = p;
                return { ...partData, serviceRecordId: id };
              }),
            });
          }
        }

        if (laborItems !== undefined) {
          await tx.serviceLabor.deleteMany({ where: { serviceRecordId: id } });
          if (laborItems.length > 0) {
            await tx.serviceLabor.createMany({
              data: laborItems.map((l) => ({
                ...l,
                serviceRecordId: id,
              })),
            });
          }
        }

        return updated;
      });

      return NextResponse.json({ workOrder });
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
      const existing = await db.serviceRecord.findFirst({
        where: { id, vehicle: { customer: { organizationId } } },
      });
      if (!existing) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      await recordDeletion("serviceRecord", id, organizationId);
      await db.serviceRecord.delete({ where: { id } });

      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
