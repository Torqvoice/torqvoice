'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { createTemplateSchema, updateTemplateSchema } from '../Schema/templateSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { TemplateSectionInput } from '../Schema/templateSchema'
import { TEMPLATE_PRESETS, presetPackageId, presetToTemplateCreate } from '../Lib/templatePresets'

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
  }))
}

export async function getTemplates() {
  return withAuth(
    async ({ organizationId, userId }) => {
      // Runs before the query, so anything new is in the list this request.
      await syncPresetLibrary(organizationId, userId)

      const templates = await db.inspectionTemplate.findMany({
        where: { organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return templates
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function getTemplate(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const template = await db.inspectionTemplate.findFirst({
        where: { id, organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })
      if (!template) throw new Error('Template not found')
      return template
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function createTemplate(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createTemplateSchema.parse(input)

      const template = await db.$transaction(async (tx) => {
        // If setting as default, unset other defaults
        if (data.isDefault) {
          await tx.inspectionTemplate.updateMany({
            where: { organizationId, isDefault: true },
            data: { isDefault: false },
          })
        }

        const created = await tx.inspectionTemplate.create({
          data: {
            name: data.name,
            description: data.description,
            isDefault: data.isDefault,
            country: data.country ?? null,
            standard: data.standard ?? 'custom',
            severityScale: data.severityScale,
            organizationId,
            sections: { create: buildSectionCreates(data.sections) },
          },
          include: {
            sections: { include: { items: true } },
          },
        })

        return created
      })

      revalidatePath('/settings/inspections')
      return template
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspectionTemplate.create',
        entity: 'InspectionTemplate',
        entityId: result.id,
        details: { key: 'inspectionTemplate_create', params: { name: result.name } },
        metadata: { templateId: result.id, templateName: result.name },
      }),
    }
  )
}

export async function updateTemplate(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateTemplateSchema.parse(input)

      const existing = await db.inspectionTemplate.findFirst({
        where: { id: data.id, organizationId },
      })
      if (!existing) throw new Error('Template not found')

      const template = await db.$transaction(async (tx) => {
        // If setting as default, unset other defaults
        if (data.isDefault) {
          await tx.inspectionTemplate.updateMany({
            where: { organizationId, isDefault: true, id: { not: data.id } },
            data: { isDefault: false },
          })
        }

        // Delete existing sections (cascades to items)
        await tx.inspectionTemplateSection.deleteMany({
          where: { templateId: data.id },
        })

        const updated = await tx.inspectionTemplate.update({
          where: { id: data.id },
          data: {
            name: data.name,
            description: data.description,
            isDefault: data.isDefault,
            country: data.country ?? null,
            standard: data.standard ?? 'custom',
            severityScale: data.severityScale,
            sections: { create: buildSectionCreates(data.sections) },
          },
          include: {
            sections: { include: { items: true } },
          },
        })

        return updated
      })

      revalidatePath('/settings/inspections')
      return template
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspectionTemplate.update',
        entity: 'InspectionTemplate',
        entityId: result.id,
        details: { key: 'inspectionTemplate_update', params: { name: result.name } },
        metadata: { templateId: result.id, templateName: result.name },
      }),
    }
  )
}

export async function deleteTemplate(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const template = await db.inspectionTemplate.findFirst({
        where: { id, organizationId },
      })
      if (!template) throw new Error('Template not found')

      const inspectionCount = await db.inspection.count({ where: { templateId: id } })
      if (inspectionCount > 0) {
        throw new Error(
          `This template has ${inspectionCount} inspection${inspectionCount === 1 ? '' : 's'}. Delete the inspections first before removing the template.`
        )
      }

      await db.inspectionTemplate.delete({ where: { id } })

      revalidatePath('/settings/templates')
      return { templateId: id, templateName: template.name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspectionTemplate.delete',
        entity: 'InspectionTemplate',
        entityId: result.templateId,
        details: { key: 'inspectionTemplate_delete', params: { name: result.templateName } },
        metadata: { templateId: result.templateId, templateName: result.templateName },
      }),
    }
  )
}

/**
 * Copies a preset from Lib/templatePresets into an editable template owned by
 * the organization. The copy is a plain template from that point on — nothing
 * links back to the preset, so the workshop can rename sections, move checks
 * and change every threshold to match its own country and equipment.
 */
export async function createTemplateFromPreset(presetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId)
      if (!preset) throw new Error('Preset not found')

      const isFirst = (await db.inspectionTemplate.count({ where: { organizationId } })) === 0

      const template = await db.inspectionTemplate.create({
        data: presetToTemplateCreate(preset, organizationId, isFirst),
        include: { sections: { include: { items: true } } },
      })

      revalidatePath('/settings/templates')
      return template
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspectionTemplate.create',
        entity: 'InspectionTemplate',
        entityId: result.id,
        details: { key: 'inspectionTemplate_createFromPreset', params: { name: result.name } },
        metadata: { templateId: result.id, templateName: result.name },
      }),
    }
  )
}

/**
 * Duplicates an existing template. Useful for keeping one checklist per country
 * or per vehicle category without rebuilding it from scratch.
 */
export async function duplicateTemplate(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const source = await db.inspectionTemplate.findFirst({
        where: { id, organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })
      if (!source) throw new Error('Template not found')

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
      })

      revalidatePath('/settings/templates')
      return template
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspectionTemplate.create',
        entity: 'InspectionTemplate',
        entityId: result.id,
        details: { key: 'inspectionTemplate_duplicate', params: { name: result.name } },
        metadata: { templateId: result.id, templateName: result.name },
      }),
    }
  )
}

/** Every preset a workshop would actually run. "blank" is a starting point for
 *  building one, not a checklist, so it stays out of the library. */
const LIBRARY_PRESETS = TEMPLATE_PRESETS.filter((p) => p.id !== 'blank')

/**
 * Marks which presets an organization has already been offered.
 *
 * Without this, topping the library up on every page load would resurrect a
 * checklist the workshop deliberately deleted, and it would be impossible to
 * get rid of. The marker records that a preset has been handled — installed or
 * consciously skipped — so deleting one is permanent, while a preset added to
 * the library in a later release still arrives on its own.
 */
const PRESETS_INSTALLED_KEY = 'inspections.presetsInstalled'

async function readHandledPresets(organizationId: string): Promise<Set<string>> {
  const row = await db.appSetting.findFirst({
    where: { organizationId, key: PRESETS_INSTALLED_KEY },
    select: { value: true },
  })
  if (!row?.value) return new Set()
  try {
    const parsed = JSON.parse(row.value)
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

/**
 * Brings the organization's list up to the current library.
 *
 * Runs on read rather than behind a button, so a workshop that has been using
 * Torqvoice for a year gets the new checklists without being told to go and
 * fetch them. It writes nothing once every preset has been handled.
 */
async function syncPresetLibrary(organizationId: string, userId: string) {
  const handled = await readHandledPresets(organizationId)
  const pending = LIBRARY_PRESETS.filter((p) => !handled.has(p.id))
  if (pending.length === 0) return 0

  const existing = await db.inspectionTemplate.findMany({
    where: { organizationId },
    select: { name: true, isDefault: true, packageId: true },
  })
  // Identity is the package id, so a workshop that renamed its copy still has
  // it recognised. Names are only consulted for templates predating provenance
  // and for one a workshop wrote itself under the same name.
  const installedIds = new Set(existing.map((t) => t.packageId).filter(Boolean))
  const takenNames = new Set(existing.map((t) => t.name.trim().toLowerCase()))
  const toCreate = pending.filter(
    (p) => !installedIds.has(presetPackageId(p)) && !takenNames.has(p.name.trim().toLowerCase())
  )

  if (toCreate.length > 0) {
    // A shop opening the app for the first time should land on the general
    // checklist, not on a national statutory test it may not be approved to run.
    const hasDefault = existing.some((t) => t.isDefault)
    await db.$transaction(
      toCreate.map((preset) =>
        db.inspectionTemplate.create({
          data: presetToTemplateCreate(
            preset,
            organizationId,
            !hasDefault && preset.id === 'standard-multipoint'
          ),
        })
      )
    )
  }

  const next = new Set([...handled, ...pending.map((p) => p.id)])
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: PRESETS_INSTALLED_KEY } },
    create: {
      organizationId,
      key: PRESETS_INSTALLED_KEY,
      value: JSON.stringify([...next]),
      userId,
    },
    update: { value: JSON.stringify([...next]) },
  })

  return toCreate.length
}

/**
 * Puts back any library checklist the workshop no longer has, ignoring the
 * handled marker. This is the deliberate "I deleted that and want it back"
 * path, which is why it is a button rather than something that happens on load.
 */
export async function restoreMissingPresets() {
  return withAuth(
    async ({ organizationId, userId }) => {
      const existing = await db.inspectionTemplate.findMany({
        where: { organizationId },
        select: { name: true, isDefault: true, packageId: true },
      })
      const installedIds = new Set(existing.map((t) => t.packageId).filter(Boolean))
      const takenNames = new Set(existing.map((t) => t.name.trim().toLowerCase()))
      const missing = LIBRARY_PRESETS.filter(
        (p) => !installedIds.has(presetPackageId(p)) && !takenNames.has(p.name.trim().toLowerCase())
      )
      if (missing.length === 0) return { added: 0 }

      const hasDefault = existing.some((t) => t.isDefault)
      await db.$transaction(
        missing.map((preset) =>
          db.inspectionTemplate.create({
            data: presetToTemplateCreate(
              preset,
              organizationId,
              !hasDefault && preset.id === 'standard-multipoint'
            ),
          })
        )
      )

      const handled = await readHandledPresets(organizationId)
      const next = new Set([...handled, ...LIBRARY_PRESETS.map((p) => p.id)])
      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key: PRESETS_INSTALLED_KEY } },
        create: {
          organizationId,
          key: PRESETS_INSTALLED_KEY,
          value: JSON.stringify([...next]),
          userId,
        },
        update: { value: JSON.stringify([...next]) },
      })

      revalidatePath('/settings/templates')
      return { added: missing.length }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function seedDefaultTemplate() {
  return withAuth(
    async ({ organizationId, userId }) => {
      const added = await syncPresetLibrary(organizationId, userId)
      revalidatePath('/settings/templates')
      return { added }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}
