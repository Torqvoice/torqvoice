"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createTemplateSchema, updateTemplateSchema } from "../Schema/templateSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import type { TemplateSectionInput } from "../Schema/templateSchema";
import { TEMPLATE_PRESETS, type TemplatePreset } from "../Lib/templatePresets";

/**
 * Sections and their checks are always rewritten wholesale rather than diffed,
 * so create and update share one builder. Positional index wins over any
 * sortOrder the client sent, which keeps the order the user dragged into place.
 */
function buildSectionCreates(sections: TemplateSectionInput[]) {
  return sections.map((section, sIdx) => ({
    name: section.name,
    description: section.description || null,
    code: section.code || null,
    sortOrder: sIdx,
    items: {
      create: section.items.map((item, iIdx) => ({
        name: item.name,
        description: item.description || null,
        code: item.code || null,
        sortOrder: iIdx,
        inputType: item.inputType,
        unit: item.unit || null,
        minValue: item.minValue ?? null,
        maxValue: item.maxValue ?? null,
        choices: item.choices ?? [],
        required: item.required,
        photoRequired: item.photoRequired,
        defaultSeverity: item.defaultSeverity ?? null,
        defectSuggestions: item.defectSuggestions ?? [],
      })),
    },
  }));
}

export async function getTemplates() {
  return withAuth(async ({ organizationId }) => {
    let templates = await db.inspectionTemplate.findMany({
      where: { organizationId },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Auto-seed default template for new organizations
    if (templates.length === 0) {
      await installPresetsForOrg(organizationId);
      templates = await db.inspectionTemplate.findMany({
        where: { organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
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
          country: data.country ?? null,
          standard: data.standard ?? "custom",
          severityScale: data.severityScale,
          organizationId,
          sections: { create: buildSectionCreates(data.sections) },
        },
        include: {
          sections: { include: { items: true } },
        },
      });

      return created;
    });

    revalidatePath("/settings/inspections");
    return template;
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.create",
      entity: "InspectionTemplate",
      entityId: result.id,
      message: `Created inspection template "${result.name}"`,
      metadata: { templateId: result.id, templateName: result.name },
    }),
  });
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
          country: data.country ?? null,
          standard: data.standard ?? "custom",
          severityScale: data.severityScale,
          sections: { create: buildSectionCreates(data.sections) },
        },
        include: {
          sections: { include: { items: true } },
        },
      });

      return updated;
    });

    revalidatePath("/settings/inspections");
    return template;
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.update",
      entity: "InspectionTemplate",
      entityId: result.id,
      message: `Updated inspection template "${result.name}"`,
      metadata: { templateId: result.id, templateName: result.name },
    }),
  });
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
    return { templateId: id, templateName: template.name };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.delete",
      entity: "InspectionTemplate",
      entityId: result.templateId,
      message: `Deleted inspection template "${result.templateName}"`,
      metadata: { templateId: result.templateId, templateName: result.templateName },
    }),
  });
}


/**
 * Copies a preset from Lib/templatePresets into an editable template owned by
 * the organization. The copy is a plain template from that point on — nothing
 * links back to the preset, so the workshop can rename sections, move checks
 * and change every threshold to match its own country and equipment.
 */
export async function createTemplateFromPreset(presetId: string) {
  return withAuth(async ({ organizationId }) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error("Preset not found");

    const isFirst = (await db.inspectionTemplate.count({ where: { organizationId } })) === 0;

    const template = await db.inspectionTemplate.create({
      data: presetToCreate(preset, organizationId, isFirst),
      include: { sections: { include: { items: true } } },
    });

    revalidatePath("/settings/templates");
    return template;
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.create",
      entity: "InspectionTemplate",
      entityId: result.id,
      message: `Created inspection template "${result.name}" from a preset`,
      metadata: { templateId: result.id, templateName: result.name },
    }),
  });
}

/**
 * Duplicates an existing template. Useful for keeping one checklist per country
 * or per vehicle category without rebuilding it from scratch.
 */
export async function duplicateTemplate(id: string) {
  return withAuth(async ({ organizationId }) => {
    const source = await db.inspectionTemplate.findFirst({
      where: { id, organizationId },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!source) throw new Error("Template not found");

    const template = await db.inspectionTemplate.create({
      data: {
        name: `${source.name} (copy)`,
        description: source.description,
        isDefault: false,
        country: source.country,
        standard: source.standard,
        severityScale: source.severityScale,
        organizationId,
        sections: {
          create: source.sections.map((section, sIdx) => ({
            name: section.name,
            description: section.description,
            code: section.code,
            sortOrder: sIdx,
            items: {
              create: section.items.map((item, iIdx) => ({
                name: item.name,
                description: item.description,
                code: item.code,
                sortOrder: iIdx,
                inputType: item.inputType,
                unit: item.unit,
                minValue: item.minValue,
                maxValue: item.maxValue,
                choices: item.choices,
                required: item.required,
                photoRequired: item.photoRequired,
                defaultSeverity: item.defaultSeverity,
                defectSuggestions: item.defectSuggestions,
              })),
            },
          })),
        },
      },
      include: { sections: { include: { items: true } } },
    });

    revalidatePath("/settings/templates");
    return template;
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.create",
      entity: "InspectionTemplate",
      entityId: result.id,
      message: `Duplicated inspection template into "${result.name}"`,
      metadata: { templateId: result.id, templateName: result.name },
    }),
  });
}

/** Turns a preset into the nested create Prisma wants. */
function presetToCreate(preset: TemplatePreset, organizationId: string, isDefault: boolean) {
  return {
    name: preset.name,
    description: preset.description,
    isDefault,
    country: preset.country,
    standard: preset.standard,
    severityScale: preset.severityScale,
    organizationId,
    sections: {
      create: preset.sections.map((section, sIdx) => ({
        name: section.name,
        description: section.description || null,
        code: section.code || null,
        sortOrder: sIdx,
        items: {
          create: section.items.map((item, iIdx) => ({
            name: item.name,
            description: item.description || null,
            code: item.code || null,
            sortOrder: iIdx,
            inputType: item.inputType ?? "condition",
            unit: item.unit || null,
            minValue: item.minValue ?? null,
            maxValue: item.maxValue ?? null,
            choices: item.choices ?? [],
            required: item.required ?? false,
            photoRequired: item.photoRequired ?? false,
            defaultSeverity: item.defaultSeverity ?? null,
            defectSuggestions: [],
          })),
        },
      })),
    },
  };
}

/** Every preset a workshop would actually run. "blank" is a starting point for
 *  building one, not a checklist, so it stays out of the library. */
const LIBRARY_PRESETS = TEMPLATE_PRESETS.filter((p) => p.id !== "blank");

/**
 * Installs the preset library, skipping anything the organization already has.
 *
 * The whole library is stocked rather than left behind an "add one" dialog:
 * picking checklists out of a picker one at a time is work, whereas deleting
 * the three you do not run is a glance. Existing templates are matched by name,
 * so running this twice adds nothing.
 */
async function installPresetsForOrg(organizationId: string) {
  const existing = await db.inspectionTemplate.findMany({
    where: { organizationId },
    select: { name: true, isDefault: true },
  });
  const taken = new Set(existing.map((t) => t.name.trim().toLowerCase()));
  const missing = LIBRARY_PRESETS.filter((p) => !taken.has(p.name.trim().toLowerCase()));
  if (missing.length === 0) return 0;

  // A shop opening the app for the first time should land on the general
  // checklist, not on a national statutory test it may not be approved to run.
  const hasDefault = existing.some((t) => t.isDefault);
  await db.$transaction(
    missing.map((preset) =>
      db.inspectionTemplate.create({
        data: presetToCreate(
          preset,
          organizationId,
          !hasDefault && preset.id === "standard-multipoint"
        ),
      })
    )
  );

  return missing.length;
}

/** Adds any preset the organization does not already have. */
export async function installMissingPresets() {
  return withAuth(async ({ organizationId }) => {
    const added = await installPresetsForOrg(organizationId);
    revalidatePath("/settings/templates");
    return { added };
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }],
  });
}

export async function seedDefaultTemplate() {
  return withAuth(async ({ organizationId }) => {
    const added = await installPresetsForOrg(organizationId);
    revalidatePath("/settings/templates");
    return { added };
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }] });
}
