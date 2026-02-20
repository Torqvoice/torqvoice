"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createTemplateSchema, updateTemplateSchema } from "../Schema/templateSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getTemplates() {
  return withAuth(async ({ organizationId }) => {
    let templates = await db.inspectionTemplate.findMany({
      where: { organizationId },
      include: {
        sections: {
          include: { items: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Auto-seed default template for new organizations
    if (templates.length === 0) {
      await seedDefaultTemplateForOrg(organizationId);
      templates = await db.inspectionTemplate.findMany({
        where: { organizationId },
        include: {
          sections: {
            include: { items: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return templates;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

export async function getTemplate(id: string) {
  return withAuth(async ({ organizationId }) => {
    const template = await db.inspectionTemplate.findFirst({
      where: { id, organizationId },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!template) throw new Error("Template not found");
    return template;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

export async function createTemplate(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createTemplateSchema.parse(input);

    const template = await db.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (data.isDefault) {
        await tx.inspectionTemplate.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.inspectionTemplate.create({
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault,
          organizationId,
          sections: {
            create: data.sections.map((section, sIdx) => ({
              name: section.name,
              sortOrder: section.sortOrder ?? sIdx,
              items: {
                create: section.items.map((item, iIdx) => ({
                  name: item.name,
                  sortOrder: item.sortOrder ?? iIdx,
                })),
              },
            })),
          },
        },
        include: {
          sections: { include: { items: true } },
        },
      });

      return created;
    });

    revalidatePath("/settings/inspections");
    return template;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function updateTemplate(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = updateTemplateSchema.parse(input);

    const existing = await db.inspectionTemplate.findFirst({
      where: { id: data.id, organizationId },
    });
    if (!existing) throw new Error("Template not found");

    const template = await db.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (data.isDefault) {
        await tx.inspectionTemplate.updateMany({
          where: { organizationId, isDefault: true, id: { not: data.id } },
          data: { isDefault: false },
        });
      }

      // Delete existing sections (cascades to items)
      await tx.inspectionTemplateSection.deleteMany({
        where: { templateId: data.id },
      });

      const updated = await tx.inspectionTemplate.update({
        where: { id: data.id },
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault,
          sections: {
            create: data.sections.map((section, sIdx) => ({
              name: section.name,
              sortOrder: section.sortOrder ?? sIdx,
              items: {
                create: section.items.map((item, iIdx) => ({
                  name: item.name,
                  sortOrder: item.sortOrder ?? iIdx,
                })),
              },
            })),
          },
        },
        include: {
          sections: { include: { items: true } },
        },
      });

      return updated;
    });

    revalidatePath("/settings/inspections");
    return template;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function deleteTemplate(id: string) {
  return withAuth(async ({ organizationId }) => {
    const template = await db.inspectionTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new Error("Template not found");

    const inspectionCount = await db.inspection.count({ where: { templateId: id } });
    if (inspectionCount > 0) {
      throw new Error(
        `This template has ${inspectionCount} inspection${inspectionCount === 1 ? "" : "s"}. Delete the inspections first before removing the template.`
      );
    }

    await db.inspectionTemplate.delete({ where: { id } });

    revalidatePath("/settings/templates");
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS }] });
}

async function seedDefaultTemplateForOrg(organizationId: string) {
  const count = await db.inspectionTemplate.count({ where: { organizationId } });
  if (count > 0) return null;

  const template = await db.inspectionTemplate.create({
    data: {
      name: "Standard Multi-Point Inspection",
      description: "Comprehensive vehicle inspection covering all major systems",
      isDefault: true,
      organizationId,
      sections: {
        create: [
          {
            name: "Exterior",
            sortOrder: 0,
            items: {
              create: [
                { name: "Body condition", sortOrder: 0 },
                { name: "Paint", sortOrder: 1 },
                { name: "Lights", sortOrder: 2 },
                { name: "Windshield", sortOrder: 3 },
                { name: "Wipers", sortOrder: 4 },
                { name: "Tires", sortOrder: 5 },
                { name: "Wheels", sortOrder: 6 },
              ],
            },
          },
          {
            name: "Under Hood",
            sortOrder: 1,
            items: {
              create: [
                { name: "Engine oil", sortOrder: 0 },
                { name: "Coolant", sortOrder: 1 },
                { name: "Brake fluid", sortOrder: 2 },
                { name: "Power steering", sortOrder: 3 },
                { name: "Battery", sortOrder: 4 },
                { name: "Belts", sortOrder: 5 },
                { name: "Hoses", sortOrder: 6 },
                { name: "Air filter", sortOrder: 7 },
              ],
            },
          },
          {
            name: "Under Vehicle",
            sortOrder: 2,
            items: {
              create: [
                { name: "Exhaust", sortOrder: 0 },
                { name: "Suspension", sortOrder: 1 },
                { name: "CV joints", sortOrder: 2 },
                { name: "Brake lines", sortOrder: 3 },
              ],
            },
          },
          {
            name: "Interior",
            sortOrder: 3,
            items: {
              create: [
                { name: "Dash lights", sortOrder: 0 },
                { name: "Horn", sortOrder: 1 },
                { name: "A/C", sortOrder: 2 },
                { name: "Heater", sortOrder: 3 },
                { name: "Seat belts", sortOrder: 4 },
              ],
            },
          },
          {
            name: "Brakes",
            sortOrder: 4,
            items: {
              create: [
                { name: "Front pads", sortOrder: 0 },
                { name: "Rear pads", sortOrder: 1 },
                { name: "Rotors", sortOrder: 2 },
                { name: "Brake lines", sortOrder: 3 },
              ],
            },
          },
          {
            name: "Tires",
            sortOrder: 5,
            items: {
              create: [
                { name: "Tread depth (LF)", sortOrder: 0 },
                { name: "Tread depth (RF)", sortOrder: 1 },
                { name: "Tread depth (LR)", sortOrder: 2 },
                { name: "Tread depth (RR)", sortOrder: 3 },
                { name: "Tire pressure", sortOrder: 4 },
                { name: "Spare tire", sortOrder: 5 },
              ],
            },
          },
        ],
      },
    },
    include: {
      sections: { include: { items: true } },
    },
  });

  revalidatePath("/settings/inspections");
  return template;
}

export async function seedDefaultTemplate() {
  return withAuth(async ({ organizationId }) => {
    return seedDefaultTemplateForOrg(organizationId);
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }] });
}

