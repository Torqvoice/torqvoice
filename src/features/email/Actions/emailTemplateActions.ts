'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import type { Prisma } from '@/generated/prisma/client'
import { EMAIL_KINDS, type EmailKind, kindSpec } from '../Lib/emailKinds'
import {
  activeTemplateId,
  activeTemplateSettingKey,
  parseEmailAssetUrl,
  type SavedEmailTemplate,
  templateAssets,
  templateText,
} from '../Lib/emailTemplate'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { missingTags, unknownTags } from '../Lib/tags'
import { buildTemplatedMail } from '../Lib/sendTemplatedMail'
import { sampleContextFor } from '../Lib/emailContext'
import { missingAssets, sweepEmailAssets } from '../Lib/emailAssets.server'
import { requireFeature } from '@/lib/features'
import {
  emailKindSchema,
  type SaveEmailTemplateInput,
  saveEmailTemplateSchema,
  savedTemplateFromRow,
} from '../Schema/emailTemplateSchema'

const SETTINGS_PAGE = '/settings/email-templates'
const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }]
const MANAGE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]

/** Every template the workshop saved, newest first. */
export async function listEmailTemplates() {
  return withAuth(
    async ({ organizationId }): Promise<SavedEmailTemplate[]> => {
      const rows = await db.emailTemplate.findMany({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
      })
      return rows.map(savedTemplateFromRow).filter((t): t is SavedEmailTemplate => t !== null)
    },
    { requiredPermissions: READ }
  )
}

/** Which template each kind sends with: a saved id, or null for the preset. */
export async function getActiveEmailTemplates() {
  return withAuth(
    async ({ organizationId }): Promise<Record<EmailKind, string | null>> => {
      const rows = await db.appSetting.findMany({
        where: { organizationId, key: { in: EMAIL_KINDS.map(activeTemplateSettingKey) } },
        select: { key: true, value: true },
      })
      const byKey = new Map(rows.map((row) => [row.key, row.value]))
      const active = {} as Record<EmailKind, string | null>
      for (const kind of EMAIL_KINDS) {
        active[kind] = activeTemplateId(byKey.get(activeTemplateSettingKey(kind)))
      }
      return active
    },
    { requiredPermissions: READ }
  )
}

/**
 * What is wrong with a template, in the workshop's terms.
 *
 * A tag this kind does not offer is a typo, and a required tag that is
 * missing is a mail that cannot do its job: a sign-in mail with no sign-in
 * link is undeliverable in the only sense that matters. The designer runs
 * the same checks as it goes, so this is the last line, not the first.
 */
export async function validateEmailTemplate(input: SaveEmailTemplateInput) {
  return withAuth(
    async () => {
      const data = saveEmailTemplateSchema.parse(input)
      return problemsWith(data)
    },
    { requiredPermissions: READ }
  )
}

function problemsWith(data: SaveEmailTemplateInput): {
  unknown: string[]
  missing: string[]
} {
  const text = templateText(data)
  const spec = kindSpec(data.kind)
  return {
    unknown: unknownTags(text, spec.tags),
    missing: missingTags(text, spec.required),
  }
}

/**
 * Saves a template under its name, and makes it the one that sends for its
 * kind. Without an id, the same name means the same template: saving again
 * updates it in place rather than filling the gallery with near-copies,
 * which is what the invoice designer has always done.
 *
 * Applying on save is deliberate. A workshop that edits a template means to
 * use it; the gallery is where a saved template is set aside, not the
 * designer.
 */
export async function saveEmailTemplate(input: SaveEmailTemplateInput) {
  return withAuth(
    async ({ userId, organizationId }): Promise<SavedEmailTemplate> => {
      await requireFeature(organizationId, 'customTemplates')
      demoGuard()
      const data = saveEmailTemplateSchema.parse(input)
      const problems = problemsWith(data)
      if (problems.unknown.length) {
        throw new Error(
          `This template uses tags that do not exist here: ${problems.unknown.map((t) => `{${t}}`).join(', ')}`
        )
      }
      if (problems.missing.length) {
        throw new Error(
          `This template has to include ${problems.missing.map((t) => `{${t}}`).join(', ')}`
        )
      }

      // A template may only point at this organisation's own uploads.
      const foreign = templateAssets(data).find(
        (asset) => parseEmailAssetUrl(asset)?.organizationId !== organizationId
      )
      if (foreign) throw new Error('This template refers to an upload that is not yours')
      // An upload that has gone, swept or never finished, must not be saved
      // into a template that would then send without it.
      const missing = await missingAssets(organizationId, data)
      if (missing.length)
        throw new Error('A picture in this template is no longer available. Upload it again.')

      const byName = await db.emailTemplate.findFirst({
        where: {
          organizationId,
          kind: data.kind,
          name: { equals: data.name, mode: 'insensitive' },
        },
        select: { id: true },
      })
      let target = data.id
        ? await db.emailTemplate.findFirst({
            where: { id: data.id, organizationId, kind: data.kind },
            select: { id: true },
          })
        : null
      // Renaming one template onto another's name would leave two with the
      // same name and the gallery unable to tell them apart.
      if (target && byName && byName.id !== target.id) {
        throw new Error('A template with this name already exists')
      }
      if (!target) target = byName

      const blocks = data.blocks as unknown as Prisma.InputJsonValue
      const theme = data.theme as Prisma.InputJsonValue
      const row = target
        ? await db.emailTemplate.update({
            where: { id: target.id },
            data: { name: data.name, subject: data.subject, blocks, theme },
          })
        : await db.emailTemplate.create({
            data: {
              organizationId,
              kind: data.kind,
              name: data.name,
              subject: data.subject,
              blocks,
              theme,
            },
          })

      const key = activeTemplateSettingKey(data.kind)
      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value: `design:${row.id}` },
        create: { userId, organizationId, key, value: `design:${row.id}` },
      })

      const saved = savedTemplateFromRow(row)
      if (!saved) throw new Error('Template could not be read back')
      // Pictures replaced or removed on the way to this save are now unreferenced.
      await sweepEmailAssets(organizationId)
      revalidatePath(SETTINGS_PAGE)
      return saved
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.saveEmailTemplate',
        entity: 'EmailTemplate',
        entityId: result.id,
        details: { key: 'settings_saveEmailTemplate', params: { name: result.name } },
      }),
    }
  )
}

/**
 * Makes a saved template the one its kind sends with, or with a null id
 * puts the kind back on the built-in preset.
 */
export async function applyEmailTemplate(kind: string, id: string | null) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await requireFeature(organizationId, 'customTemplates')
      demoGuard()
      const parsedKind = emailKindSchema.parse(kind)
      if (id !== null) rowIdSchema.parse(id)
      const key = activeTemplateSettingKey(parsedKind)

      if (id === null) {
        await db.appSetting.deleteMany({ where: { organizationId, key } })
        revalidatePath(SETTINGS_PAGE)
        return { id: null, kind: parsedKind, name: 'preset' }
      }

      const row = await db.emailTemplate.findFirst({
        where: { id, organizationId, kind: parsedKind },
        select: { id: true, name: true },
      })
      if (!row) throw new Error('Template not found')

      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value: `design:${row.id}` },
        create: { userId, organizationId, key, value: `design:${row.id}` },
      })
      revalidatePath(SETTINGS_PAGE)
      return { id: row.id, kind: parsedKind, name: row.name }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.applyEmailTemplate',
        entity: 'EmailTemplate',
        entityId: result.id ?? undefined,
        details: {
          key: 'settings_applyEmailTemplate',
          params: { name: result.name, kind: result.kind },
        },
      }),
    }
  )
}

/**
 * Removes a template. If it was the one that sent, the kind falls back to
 * the built-in preset, which is what the resolver does when the setting
 * points at nothing.
 */
export async function deleteEmailTemplate(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customTemplates')
      demoGuard()
      rowIdSchema.parse(id)
      const row = await db.emailTemplate.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true, kind: true },
      })
      if (!row) throw new Error('Template not found')

      await db.$transaction([
        db.emailTemplate.delete({ where: { id: row.id } }),
        db.appSetting.deleteMany({
          where: {
            organizationId,
            key: activeTemplateSettingKey(row.kind as EmailKind),
            value: `design:${row.id}`,
          },
        }),
      ])
      await sweepEmailAssets(organizationId)
      revalidatePath(SETTINGS_PAGE)
      return { id: row.id, name: row.name }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.deleteEmailTemplate',
        entity: 'EmailTemplate',
        entityId: result.id,
        details: { key: 'settings_deleteEmailTemplate', params: { name: result.name } },
      }),
    }
  )
}

const testRecipientSchema = z.string().trim().email()
/** Prisma drops an undefined filter, which would make findFirst return any row. */
const rowIdSchema = z.string().min(1).max(64)

/**
 * Sends the template being edited to an address of the editor's choosing,
 * filled with the same stand-in data the preview uses. The one control that
 * answers the question an editor cannot: what it looks like in a real mail
 * client.
 */
export async function sendTestEmail(input: SaveEmailTemplateInput, recipientEmail: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      demoGuard()
      // The same gates as a real send: the plan allows email, and the
      // workshop has not switched it off.
      await requireFeature(organizationId, 'smtp')
      const enabled = await db.appSetting.findUnique({
        where: { organizationId_key: { organizationId, key: 'workshop.emailEnabled' } },
        select: { value: true },
      })
      if (enabled?.value === 'false')
        throw new Error('Email sending is disabled. Enable it in Settings.')
      const data = saveEmailTemplateSchema.parse(input)
      const to = testRecipientSchema.parse(recipientEmail)
      const sender = await db.user.findUnique({ where: { id: userId }, select: { name: true } })

      const mail = await buildTemplatedMail(organizationId, {
        kind: data.kind,
        to,
        context: sampleContextFor(data.kind, sender?.name),
        template: data,
        attached: kindSpec(data.kind).hasAttachment,
      })
      await sendOrgMail(organizationId, {
        from: await getOrgFromAddress(organizationId),
        to,
        subject: `[Test] ${mail.subject}`,
        html: mail.html,
        text: mail.text,
      })
      return { sent: true, recipientEmail: to }
    },
    { requiredPermissions: MANAGE }
  )
}
