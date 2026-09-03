'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { Prisma } from '@/generated/prisma/client'
import {
  DESIGNER_LAYOUT_VERSION,
  invoiceLayoutConfigSchema,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { DocumentType, SavedDesign } from '../Components/types'
import {
  DESIGN_DOCUMENT_TYPES,
  designSourceFromStored,
  designTemplateSchema,
  savedDesignFromRow,
} from '../Lib/designSource'
import { DESIGN_AUTO_RULES } from '../Lib/designRules'

const documentTypeSchema = z.enum(['invoice', 'quote'])

const saveDesignSchema = z.object({
  id: z.string().optional(),
  documentType: documentTypeSchema,
  name: z.string().trim().min(1).max(60),
  layout: invoiceLayoutConfigSchema.partial(),
  template: designTemplateSchema,
})

export type SaveDesignInput = z.input<typeof saveDesignSchema>

/** Every design the workshop saved for one document, newest first. */
export async function listDocumentDesigns(documentType: DocumentType) {
  return withAuth(
    async ({ organizationId }): Promise<SavedDesign[]> => {
      const rows = await db.documentDesign.findMany({
        where: { organizationId, documentType: documentTypeSchema.parse(documentType) },
        orderBy: { updatedAt: 'desc' },
      })
      return rows.map(savedDesignFromRow).filter((d): d is SavedDesign => d !== null)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * The names alone, for a picker on an invoice or a customer. Anyone who may
 * edit those may see what designs exist; the layouts themselves stay behind
 * the settings permission.
 */
export async function listDesignOptions(documentType: DocumentType) {
  return withAuth(
    async ({ organizationId }) => {
      return db.documentDesign.findMany({
        where: { organizationId, documentType: documentTypeSchema.parse(documentType) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

/**
 * Saves a design under its name. Without an id, the same name means the
 * same design: saving again updates it in place rather than filling the
 * gallery with near-copies, which is what the designer has always done.
 */
export async function saveDocumentDesign(input: SaveDesignInput) {
  return withAuth(
    async ({ organizationId }): Promise<SavedDesign> => {
      const data = saveDesignSchema.parse(input)
      const layout = data.layout as Prisma.InputJsonValue
      const template = data.template as Prisma.InputJsonValue

      let target = data.id
        ? await db.documentDesign.findFirst({
            where: { id: data.id, organizationId, documentType: data.documentType },
            select: { id: true },
          })
        : null
      if (!target) {
        target = await db.documentDesign.findFirst({
          where: {
            organizationId,
            documentType: data.documentType,
            name: { equals: data.name, mode: 'insensitive' },
          },
          select: { id: true },
        })
      }

      const row = target
        ? await db.documentDesign.update({
            where: { id: target.id },
            data: { name: data.name, layout, template },
          })
        : await db.documentDesign.create({
            data: {
              organizationId,
              documentType: data.documentType,
              name: data.name,
              layout,
              template,
            },
          })

      const saved = savedDesignFromRow(row)
      if (!saved) throw new Error('Design could not be read back')
      revalidatePath('/settings/templates')
      return saved
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.saveDocumentDesign',
        entity: 'DocumentDesign',
        entityId: result.id,
        details: { key: 'settings_saveDocumentDesign', params: { name: result.name } },
      }),
    }
  )
}

/**
 * What still points at a design: invoices not yet issued, and customers.
 * Issued invoices are counted for the record but are never affected, since
 * they print from their own snapshot.
 */
export async function getDocumentDesignUsage(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const design = await db.documentDesign.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!design) throw new Error('Design not found')
      const [drafts, issued, customers] = await Promise.all([
        db.serviceRecord.count({ where: { designId: id, issuedAt: null } }),
        db.serviceRecord.count({ where: { designId: id, issuedAt: { not: null } } }),
        db.customer.count({ where: { invoiceDesignId: id } }),
      ])
      return { drafts, issued, customers }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * Removes a design. Drafts and customers that chose it fall back to the
 * default through the SetNull foreign keys; issued invoices keep their
 * snapshot and do not notice.
 */
export async function deleteDocumentDesign(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const design = await db.documentDesign.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true },
      })
      if (!design) throw new Error('Design not found')
      await db.documentDesign.delete({ where: { id: design.id } })
      revalidatePath('/settings/templates')
      return { id: design.id, name: design.name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.deleteDocumentDesign',
        entity: 'DocumentDesign',
        entityId: result.id,
        details: { key: 'settings_deleteDocumentDesign', params: { name: result.name } },
      }),
    }
  )
}

/**
 * Makes a saved design the one the document prints with by default: the
 * same writes the designer's Save makes, without opening the designer. The
 * settings keys stay the source of the default, because the classic
 * template page and every quote renderer still read them.
 */
export async function applyDocumentDesign(id: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const row = await db.documentDesign.findFirst({ where: { id, organizationId } })
      if (!row) throw new Error('Design not found')
      const documentType = DESIGN_DOCUMENT_TYPES.includes(row.documentType as DocumentType)
        ? (row.documentType as DocumentType)
        : 'invoice'
      const source = designSourceFromStored(row.layout, row.template)
      if (!source) throw new Error('Design could not be read')

      const prefix = documentType
      const layout = { ...mergeWithDefaults(source.layout), version: DESIGNER_LAYOUT_VERSION }
      const t = source.template
      const entries: Record<string, string> = {
        [`${prefix}.layoutConfig`]: JSON.stringify(invoiceLayoutConfigSchema.parse(layout)),
        [`${prefix}.primaryColor`]: t.primaryColor,
        [`${prefix}.backgroundColor`]: t.backgroundColor,
        [`${prefix}.textColor`]: t.textColor,
        [`${prefix}.companyTextColor`]: t.companyTextColor,
        [`${prefix}.frameBorderColor`]: t.frameBorderColor,
        [`${prefix}.frameShadow`]: t.frameShadow,
        [`${prefix}.frameRadius`]: String(t.frameRadius),
        [`${prefix}.frameSide`]: t.frameSide,
        [`${prefix}.fontFamily`]: t.fontFamily,
        [`${prefix}.headerStyle`]: t.headerStyle,
        [`${prefix}.logoSize`]: String(t.logoSize),
        [`${prefix}.logo`]: t.logoUrl,
        [`${prefix}.activeDesign`]: `design:${row.id}`,
      }
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          })
        )
      )
      revalidatePath('/settings/templates')
      revalidatePath('/settings/invoice')
      return { id: row.id, name: row.name, documentType }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.applyDocumentDesign',
        entity: 'DocumentDesign',
        entityId: result.id,
        details: { key: 'settings_applyDocumentDesign', params: { name: result.name } },
      }),
    }
  )
}

const autoRuleSchema = z.enum(DESIGN_AUTO_RULES).nullable()

/**
 * Makes a design volunteer itself for one kind of invoice, or stop doing so.
 * A rule belongs to one design at a time: giving it to this one takes it
 * from whichever had it, in the same transaction, so the unique index never
 * refuses the move. Issued invoices are unaffected, as ever: they print from
 * their snapshot, and a rule only ever decides a draft's look.
 */
export async function setDocumentDesignRule(id: string, rule: string | null) {
  return withAuth(
    async ({ organizationId }) => {
      const autoRule = autoRuleSchema.parse(rule)
      const design = await db.documentDesign.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true, documentType: true },
      })
      if (!design) throw new Error('Design not found')
      await db.$transaction(async (tx) => {
        if (autoRule) {
          await tx.documentDesign.updateMany({
            where: {
              organizationId,
              documentType: design.documentType,
              autoRule,
              id: { not: design.id },
            },
            data: { autoRule: null },
          })
        }
        await tx.documentDesign.update({ where: { id: design.id }, data: { autoRule } })
      })
      revalidatePath('/settings/templates')
      return { id: design.id, name: design.name, autoRule }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.setDocumentDesignRule',
        entity: 'DocumentDesign',
        entityId: result.id,
        details: {
          key: 'settings_setDocumentDesignRule',
          params: { name: result.name, rule: result.autoRule ?? 'none' },
        },
      }),
    }
  )
}
