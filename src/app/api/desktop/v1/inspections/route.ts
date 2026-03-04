import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createInspectionSchema } from "@/features/inspections/Schema/inspectionSchema";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ userId, organizationId }) => {
      const body = await request.json();
      const data = createInspectionSchema.parse(body);

      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const template = await db.inspectionTemplate.findFirst({
        where: { id: data.templateId, organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const inspection = await db.$transaction(async (tx) => {
        const created = await tx.inspection.create({
          data: {
            vehicleId: data.vehicleId,
            templateId: data.templateId,
            mileage: data.mileage,
            technicianId: userId,
            organizationId,
          },
        });

        const items = template.sections.flatMap((section, sIdx) =>
          section.items.map((item) => ({
            name: item.name,
            section: section.name,
            sortOrder: sIdx * 1000 + item.sortOrder,
            inspectionId: created.id,
          })),
        );

        if (items.length > 0) {
          await tx.inspectionItem.createMany({ data: items });
        }

        return tx.inspection.findUniqueOrThrow({
          where: { id: created.id },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        });
      });

      return NextResponse.json({ inspection }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
    },
  );
}
