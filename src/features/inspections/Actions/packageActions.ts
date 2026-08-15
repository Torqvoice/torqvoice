"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  PACKAGE_FORMAT_VERSION,
  PackageFormatError,
  parsePackage,
  type PackageManifest,
} from "@/lib/packages/format";
import { reviewContents } from "@/lib/packages/registry";
import {
  INSPECTION_TEMPLATE_TYPE,
  countCustomWording,
  packagedTemplateSchema,
  withoutCustomWording,
  type PackagedTemplate,
} from "../Lib/inspectionTemplatePackage";

/**
 * Reads a template out of the database in package shape.
 *
 * Deliberately field-by-field rather than spreading the row: ids, timestamps,
 * the organization and the default flag are all local facts that mean nothing
 * — or the wrong thing — on another instance.
 */
export async function exportTemplatePackage(
  id: string,
  options: { includeCustomWording?: boolean; author?: string } = {}
) {
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

    const payload: PackagedTemplate = packagedTemplateSchema.parse({
      name: template.name,
      description: template.description,
      country: template.country,
      standard: template.standard,
      severityScale: template.severityScale === "basic" ? "basic" : "eu",
      sections: template.sections.map((section) => ({
        name: section.name,
        description: section.description,
        code: section.code,
        items: section.items.map((item) => ({
          name: item.name,
          description: item.description,
          code: item.code,
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
      })),
    });

    const data = options.includeCustomWording ? payload : withoutCustomWording(payload);

    const manifest: PackageManifest = {
      formatVersion: PACKAGE_FORMAT_VERSION,
      kind: "bundle",
      // A template written here has no package identity of its own yet, so the
      // export gets one derived from the row. Keeping the original id for a
      // template that came from the library means an import elsewhere can tell
      // it is the same checklist rather than a lookalike.
      id: template.packageId ?? `local/${template.id}`,
      version: template.packageVersion ?? "1.0.0",
      name: template.name,
      description: template.description ?? undefined,
      author: options.author?.trim() || undefined,
      exportedAt: new Date().toISOString(),
      contents: [{ type: INSPECTION_TEMPLATE_TYPE, data }],
    };

    return {
      manifest,
      customWordingCount: countCustomWording(payload),
      includedCustomWording: !!options.includeCustomWording,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

/**
 * Installs a package.
 *
 * Everything is validated before a single row is written, and the write is one
 * transaction, so a file that turns out to be malformed halfway through cannot
 * leave a workshop with a checklist that looks complete and is not.
 */
export async function importTemplatePackage(raw: unknown) {
  return withAuth(async ({ organizationId }) => {
    let manifest: PackageManifest;
    let reviewed: ReturnType<typeof reviewContents>;
    try {
      manifest = parsePackage(raw);
      reviewed = reviewContents(manifest.contents);
    } catch (error) {
      if (error instanceof PackageFormatError) throw new Error(error.message);
      throw error;
    }

    const templates = reviewed.filter((c) => c.type === INSPECTION_TEMPLATE_TYPE);
    if (templates.length === 0) {
      throw new Error("This package does not contain an inspection template.");
    }

    // An imported checklist is never made the default, and never silently
    // replaces one already installed: it arrives beside whatever is there and
    // the workshop decides. Overwriting a checklist someone runs tests from is
    // not a decision an import should take.
    const existingNames = new Set(
      (
        await db.inspectionTemplate.findMany({
          where: { organizationId },
          select: { name: true },
        })
      ).map((t) => t.name.trim().toLowerCase())
    );

    const created = await db.$transaction(
      templates.map((content) => {
        const data = content.data as PackagedTemplate;
        const name = existingNames.has(data.name.trim().toLowerCase())
          ? `${data.name} (imported)`
          : data.name;

        return db.inspectionTemplate.create({
          data: {
            name,
            description: data.description ?? null,
            isDefault: false,
            country: data.country ?? null,
            standard: data.standard ?? "custom",
            severityScale: data.severityScale,
            packageId: manifest.id,
            packageVersion: manifest.version,
            packageSource: "file",
            organizationId,
            sections: {
              create: data.sections.map((section, sIdx) => ({
                name: section.name,
                description: section.description ?? null,
                code: section.code ?? null,
                sortOrder: sIdx,
                items: {
                  create: section.items.map((item, iIdx) => ({
                    name: item.name,
                    description: item.description ?? null,
                    code: item.code ?? null,
                    sortOrder: iIdx,
                    inputType: item.inputType,
                    unit: item.unit ?? null,
                    minValue: item.minValue ?? null,
                    maxValue: item.maxValue ?? null,
                    choices: item.choices,
                    required: item.required,
                    photoRequired: item.photoRequired,
                    defaultSeverity: item.defaultSeverity ?? null,
                    defectSuggestions: item.defectSuggestions,
                  })),
                },
              })),
            },
          },
          select: { id: true, name: true },
        });
      })
    );

    revalidatePath("/settings/templates");
    return { templates: created };
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }],
    audit: ({ result }) => ({
      action: "inspectionTemplate.import",
      entity: "InspectionTemplate",
      entityId: result.templates[0]?.id,
      message: `Imported ${result.templates.length} inspection template(s) from a package`,
      metadata: { count: result.templates.length },
    }),
  });
}
