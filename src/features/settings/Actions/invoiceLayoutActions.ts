'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  type InvoiceLayoutConfig,
  invoiceLayoutConfigSchema,
  mergeWithDefaults,
  getDefaultInvoiceLayout,
  SECTIONS_WITH_FIELDS,
  toCustomFieldId,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { EntityType } from '@/features/custom-fields/Schema/customFieldSchema'

type LayoutSettingKey =
  | typeof SETTING_KEYS.INVOICE_LAYOUT_CONFIG
  | typeof SETTING_KEYS.QUOTE_LAYOUT_CONFIG

async function loadLayoutConfig(
  organizationId: string,
  key: LayoutSettingKey
): Promise<InvoiceLayoutConfig> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key,
      },
    },
  })

  if (!setting?.value) {
    return getDefaultInvoiceLayout()
  }

  const parsed = JSON.parse(setting.value)
  return mergeWithDefaults(parsed)
}

async function persistLayoutConfig(
  userId: string,
  organizationId: string,
  key: LayoutSettingKey,
  config: InvoiceLayoutConfig
): Promise<InvoiceLayoutConfig> {
  const validated = invoiceLayoutConfigSchema.parse(config)
  const value = JSON.stringify(validated)

  await db.appSetting.upsert({
    where: {
      organizationId_key: {
        organizationId,
        key,
      },
    },
    update: { value },
    create: {
      userId,
      organizationId,
      key,
      value,
    },
  })

  return validated
}

export async function getInvoiceLayoutConfig() {
  return withAuth(
    async ({ organizationId }) =>
      loadLayoutConfig(organizationId, SETTING_KEYS.INVOICE_LAYOUT_CONFIG),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export async function saveInvoiceLayoutConfig(config: InvoiceLayoutConfig) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const validated = await persistLayoutConfig(
        userId,
        organizationId,
        SETTING_KEYS.INVOICE_LAYOUT_CONFIG,
        config
      )

      revalidatePath('/settings/templates')
      revalidatePath('/settings/invoice')
      return validated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: () => ({
        action: 'settings.updateInvoiceLayout',
        entity: 'AppSetting',
        details: { key: 'settings_updateInvoiceLayout' },
      }),
    }
  )
}

export async function getQuoteLayoutConfig() {
  return withAuth(
    async ({ organizationId }) =>
      loadLayoutConfig(organizationId, SETTING_KEYS.QUOTE_LAYOUT_CONFIG),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export async function saveQuoteLayoutConfig(config: InvoiceLayoutConfig) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const validated = await persistLayoutConfig(
        userId,
        organizationId,
        SETTING_KEYS.QUOTE_LAYOUT_CONFIG,
        config
      )

      revalidatePath('/settings/templates')
      return validated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: () => ({
        action: 'settings.updateQuoteLayout',
        entity: 'AppSetting',
        details: { key: 'settings_updateQuoteLayout' },
      }),
    }
  )
}

/** Where a custom field prints: a section id, or hidden from the document entirely. */
export type CustomFieldPlacement = string

export async function setCustomFieldPlacement(input: {
  definitionId: string
  entityType: EntityType
  placement: CustomFieldPlacement
}) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { definitionId, entityType, placement } = input

      if (placement !== 'hidden' && !SECTIONS_WITH_FIELDS.has(placement)) {
        throw new Error('Invalid placement')
      }

      const definition = await db.customFieldDefinition.findFirst({
        where: { id: definitionId, organizationId, entityType },
      })
      if (!definition) throw new Error('Field not found')

      const key =
        entityType === 'quote'
          ? SETTING_KEYS.QUOTE_LAYOUT_CONFIG
          : SETTING_KEYS.INVOICE_LAYOUT_CONFIG
      const config = await loadLayoutConfig(organizationId, key)
      const cfId = toCustomFieldId(definitionId)
      // "hidden" is stored as an invisible entry in "general": still assigned,
      // so the print builders' auto-append of unassigned fields skips it.
      const targetId = placement === 'hidden' ? 'general' : placement

      const sections = config.sections.map((section) => {
        const fields = (section.fields ?? []).filter((f) => f.id !== cfId)
        if (section.id !== targetId) {
          return section.fields ? { ...section, fields } : section
        }
        fields.push({ id: cfId, visible: placement !== 'hidden' })
        // "general" is hidden by default; placing a field there must switch it on.
        const visible = placement === 'general' ? true : section.visible
        return { ...section, fields, visible }
      })

      // Deliberately no version stamp: persisting the merged config must not
      // graduate a classic layout to designer rendering (isDesignerLayout).
      await persistLayoutConfig(userId, organizationId, key, { ...config, sections })

      revalidatePath('/settings/custom-fields')
      revalidatePath('/settings/invoice')
      return { definitionId, placement }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.setCustomFieldPlacement',
        entity: 'AppSetting',
        details: { key: 'settings_setCustomFieldPlacement' },
        metadata: { fieldId: result.definitionId, placement: result.placement },
      }),
    }
  )
}
