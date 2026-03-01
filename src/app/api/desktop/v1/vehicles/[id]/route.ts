import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateVehicleSchema } from "@/features/vehicles/Schema/vehicleSchema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id, organizationId },
        include: {
          customer: { select: { id: true, name: true, company: true, email: true, phone: true } },
          serviceRecords: {
            orderBy: { serviceDate: "desc" },
            select: { id: true, cost: true, totalAmount: true },
          },
          reminders: {
            orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }],
            select: {
              id: true,
              title: true,
              description: true,
              dueDate: true,
              dueMileage: true,
              isCompleted: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              serviceRecords: true,
              notes: true,
              reminders: true,
            },
          },
        },
      });

      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      return NextResponse.json({ vehicle });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
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
      const { id: _schemaId, ...data } = updateVehicleSchema.parse({ ...body, id });

      const result = await db.vehicle.updateMany({
        where: { id, organizationId },
        data: {
          ...data,
          vin: data.vin !== undefined ? (data.vin || null) : undefined,
          licensePlate: data.licensePlate !== undefined ? (data.licensePlate || null) : undefined,
          color: data.color !== undefined ? (data.color || null) : undefined,
          fuelType: data.fuelType !== undefined ? (data.fuelType || null) : undefined,
          transmission: data.transmission !== undefined ? (data.transmission || null) : undefined,
          engineSize: data.engineSize !== undefined ? (data.engineSize || null) : undefined,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
          customerId: data.customerId !== undefined ? (data.customerId || null) : undefined,
        },
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const vehicle = await db.vehicle.findFirst({
        where: { id, organizationId },
      });

      return NextResponse.json({ vehicle });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const body = await request.json();
      const { action } = body;

      if (action === "archive") {
        const result = await db.vehicle.updateMany({
          where: { id, organizationId },
          data: { isArchived: true, archiveReason: body.reason || null },
        });
        if (result.count === 0) {
          return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
      }

      if (action === "unarchive") {
        const result = await db.vehicle.updateMany({
          where: { id, organizationId },
          data: { isArchived: false, archiveReason: null },
        });
        if (result.count === 0) {
          return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
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
      const result = await db.vehicle.deleteMany({
        where: { id, organizationId },
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
