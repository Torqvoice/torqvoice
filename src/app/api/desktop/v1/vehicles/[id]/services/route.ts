import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

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
      const search = url.searchParams.get("search") || "";
      const type = url.searchParams.get("type") || "all";
      const skip = (page - 1) * pageSize;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { vehicleId: id };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { diagnosticNotes: { contains: search, mode: "insensitive" } },
          { techName: { contains: search, mode: "insensitive" } },
          { shopName: { contains: search, mode: "insensitive" } },
        ];
      }

      if (type && type !== "all") {
        where.type = type;
      }

      const [records, total] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            _count: { select: { partItems: true, laborItems: true, attachments: true } },
          },
          orderBy: { serviceDate: "desc" },
          skip,
          take: pageSize,
        }),
        db.serviceRecord.count({ where }),
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
