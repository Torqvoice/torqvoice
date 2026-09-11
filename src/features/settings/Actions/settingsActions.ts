'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import type { SettingKey } from '../Schema/settingsSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuardSettingKey } from '@/lib/demo'
import { assertOwnUploads } from '@/lib/upload-url'
import { armFeatureHints } from '../Lib/armFeatureHints'
import { requireFeature } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

export async function getSetting(key: SettingKey) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const setting = await db.appSetting.findUnique({
        where: { organizationId_key: { organizationId, key } },
      })
      return setting?.value ?? null
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export async function getSettings(keys?: SettingKey[]) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const where = keys ? { organizationId, key: { in: keys } } : { organizationId }

      const settings = await db.appSetting.findMany({ where })

      const map: Record<string, string> = {}
      for (const s of settings) {
        map[s.key] = s.value
      }
      return map
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * Settings that switch a paid feature on are refused on a plan without it.
 * The settings pages are gated, but a setting is one server call away, and
 * the customer portal used to be reachable that way on the free plan.
 */
async function assertPlanAllowsSetting(organizationId: string, entries: Record<string, string>) {
  if (entries[SETTING_KEYS.PORTAL_ENABLED] === 'true') {
    await requireFeature(organizationId, 'customerPortal')
  }
}

export async function setSetting(key: SettingKey, value: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      demoGuardSettingKey(key)
      assertOwnUploads(value, organizationId)
      await assertPlanAllowsSetting(organizationId, { [key]: value })
      await armFeatureHints(db, organizationId, userId, { [key]: value })
      const setting = await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: { userId, organizationId, key, value },
      })
      // See setSettings: sibling settings pages read each other's values.
      revalidatePath('/settings', 'layout')
      return setting
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}

export async function setSettings(entries: Record<string, string>) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await assertPlanAllowsSetting(organizationId, entries)
      for (const key of Object.keys(entries)) demoGuardSettingKey(key)
      assertOwnUploads(entries, organizationId)
      await armFeatureHints(db, organizationId, userId, entries)
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          })
        )
      )
      // "layout" so the sibling settings pages pick it up too: company details
      // saved here feed the previews over on /settings/templates.
      revalidatePath('/settings', 'layout')
      return true
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}

export async function dismissLicenseExpiryBanner() {
  return withAuth(
    async ({ userId, organizationId }) => {
      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key: 'license.expiryDismissed' } },
        update: { value: 'true' },
        create: { userId, organizationId, key: 'license.expiryDismissed', value: 'true' },
      })
      revalidatePath('/')
      return { success: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
