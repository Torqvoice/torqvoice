import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createServiceSchema } from "@/features/vehicles/Schema/serviceSchema";

export async function GET(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));
      const search = url.searchParams.get("search") || "";
      const status = url.searchParams.get("status") || "";
      const type = url.searchParams.get("type") || "";
      const skip = (page - 1) * pageSize;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        vehicle: { customer: { organizationId } },
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { techName: { contains: search, mode: "insensitive" } },
          { vehicle: { make: { contains: search, mode: "insensitive" } } },
          { vehicle: { model: { contains: search, mode: "insensitive" } } },
          { vehicle: { licensePlate: { contains: search, mode: "insensitive" } } },
        ];
      }

      if (status && status !== "all") {
        where.status = status;
      }

      if (type && type !== "all") {
        where.type = type;
      }

      const [workOrders, total] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { id: true, name: true, company: true } },
              },
            },
            _count: { select: { partItems: true, laborItems: true, attachments: true } },
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: pageSize,
        }),
        db.serviceRecord.count({ where }),
      ]);

      return NextResponse.json({
        workOrders,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const body = await request.json();
      const data = createServiceSchema.parse(body);

      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, customer: { organizationId } },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const { partItems, laborItems, attachments, ...recordData } = data;

      const workOrder = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            ...(body.id ? { id: body.id } : {}),
            ...recordData,
            serviceDate: new Date(recordData.serviceDate),
          },
        });

        if (partItems && partItems.length > 0) {
          await tx.servicePart.createMany({
            data: partItems.map((p) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { inventoryPartId: _inv, ...partData } = p;
              return { ...partData, serviceRecordId: created.id };
            }),
          });
        }

        if (laborItems && laborItems.length > 0) {
          await tx.serviceLabor.createMany({
            data: laborItems.map((l) => ({
              ...l,
              serviceRecordId: created.id,
            })),
          });
        }

        if (attachments && attachments.length > 0) {
          await tx.serviceAttachment.createMany({
            data: attachments.map((a) => ({
              ...a,
              serviceRecordId: created.id,
            })),
          });
        }

        return created;
      });

      return NextResponse.json({ workOrder }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );
}
