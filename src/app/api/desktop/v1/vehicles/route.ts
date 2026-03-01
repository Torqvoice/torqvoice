import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createVehicleSchema } from "@/features/vehicles/Schema/vehicleSchema";

export async function GET(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));
      const search = url.searchParams.get("search") || "";
      const archived = url.searchParams.get("archived") === "true";
      const skip = (page - 1) * pageSize;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId, isArchived: archived };

      if (search) {
        where.OR = [
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { licensePlate: { contains: search, mode: "insensitive" } },
          { vin: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
        ];
        if (!isNaN(Number(search))) {
          where.OR.push({ year: Number(search) });
        }
      }

      const [vehicles, total, archivedCount] = await Promise.all([
        db.vehicle.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true, company: true } },
            _count: { select: { serviceRecords: true } },
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: pageSize,
        }),
        db.vehicle.count({ where }),
        db.vehicle.count({ where: { organizationId, isArchived: true } }),
      ]);

      return NextResponse.json({
        vehicles,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        archivedCount,
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ userId, organizationId }) => {
      const body = await request.json();
      const data = createVehicleSchema.parse(body);

      const vehicle = await db.vehicle.create({
        data: {
          ...data,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          customerId: data.customerId || null,
          userId,
          organizationId,
        },
      });

      return NextResponse.json({ vehicle }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
