import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateCustomerSchema } from "@/features/customers/Schema/customerSchema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id, organizationId },
        include: {
          vehicles: {
            where: { isArchived: false },
            include: {
              _count: { select: { serviceRecords: true } },
            },
            orderBy: { updatedAt: "desc" },
          },
          _count: { select: { vehicles: true } },
        },
      });

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      return NextResponse.json({ customer });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
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
      const { id: _schemaId, ...data } = updateCustomerSchema.parse({ ...body, id });

      const result = await db.customer.updateMany({
        where: { id, organizationId },
        data: {
          ...data,
          email: data.email || null,
          company: data.company || null,
          phone: data.phone || null,
          address: data.address || null,
        },
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      const customer = await db.customer.findFirst({
        where: { id, organizationId },
      });

      return NextResponse.json({ customer });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
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
      const result = await db.customer.deleteMany({
        where: { id, organizationId },
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}
