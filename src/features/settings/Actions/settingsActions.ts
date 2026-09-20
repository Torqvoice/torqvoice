'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import type { SettingKey } from '../Schema/settingsSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuardSettingKey } from '@/lib/demo'
import { assertOwnUploads } from '@/lib/upload-url'
import { armFeatureHints } from '../Lib/armFeatureHints'
import { MEMBER_READABLE_SETTINGS } from '../Lib/memberReadableSettings'
import { requireFeature } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { releaseReplacedSettingFiles, settingValuesBefore } from '@/lib/files/settings'

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

/**
 * How the workshop's work is shown: currency, units, tax and labour defaults,
 * the address on a document. Readable by every member, because a member who
 * may open a work order has to see it in the workshop's own currency.
 *
 * Only what is named in MEMBER_READABLE_SETTINGS is ever returned. Anything
 * else asked for is left out rather than refused, so a page that asks for one
 * key too many still renders, and that key simply is not there: it is read
 * through `getSettings`, behind the Settings permission, or not at all.
 */
export async function getDisplaySettings(keys: SettingKey[]) {
  return withAuth(async ({ organizationId }) => {
    const allowed = keys.filter((key) => MEMBER_READABLE_SETTINGS.has(key))
    if (allowed.length === 0) return {} as Record<string, string>

    const settings = await db.appSetting.findMany({
      where: { organizationId, key: { in: allowed } },
      select: { key: true, value: true },
    })

    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return map
  })
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
      const before = await settingValuesBefore(organizationId, [key])
      const setting = await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: { userId, organizationId, key, value },
      })
      // A logo or background replaced or removed: its file is let go.
      await releaseReplacedSettingFiles(organizationId, before, { [key]: value })
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
      const before = await settingValuesBefore(organizationId, Object.keys(entries))
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          })
        )
      )
      await releaseReplacedSettingFiles(organizationId, before, entries)
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
