import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createNoteSchema } from "@/features/vehicles/Schema/noteSchema";

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
        select: { id: true },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "10", 10)));
      const skip = (page - 1) * pageSize;

      const [records, total] = await Promise.all([
        db.note.findMany({
          where: { vehicleId: id },
          orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
          skip,
          take: pageSize,
        }),
        db.note.count({ where: { vehicleId: id } }),
      ]);

      return NextResponse.json({
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const body = await request.json();
      const data = createNoteSchema.parse({ ...body, vehicleId: id });

      const note = await db.note.create({ data });
      return NextResponse.json({ note }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
