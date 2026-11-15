'use server'

import { revalidatePath } from 'next/cache'
import { armFeatureHints } from '@/features/settings/Lib/armFeatureHints'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { demoGuardSettingKey } from '@/lib/demo'
import { requireFeature } from '@/lib/features'
import { releaseReplacedSettingFiles, settingValuesBefore } from '@/lib/files/settings'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { publishPortalChatSwitched } from '@/lib/realtime/portal.server'
import { assertOwnUploads } from '@/lib/upload-url'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import { normalizeAccent } from '../Lib/theme'
import {
  checkPortalSlug,
  customerPortalSettingsSchema,
  type SaveCustomerPortalSettingsResult,
} from '../Schema/customerPortalSettingsSchema'

/**
 * Saves the whole Customer Portal settings page: the switch, the address, the
 * text about the workshop, the theme, the colour, the cover photo and the
 * optional parts. One write, so the page has one Save and a customer never
 * sees half of a change.
 *
 * An address that cannot be used is an answer, not a failure: nothing is
 * written and the form says which rule it broke. Turning the portal on is
 * refused by a plan without it (`gated`).
 *
 * The portal reads its look on every request (`loadPortalLook`), so the
 * sign-in page and every page after it show the new theme on their next load.
 * The portal's routes are revalidated all the same, so that stays true if one
 * of them is ever rendered ahead of time.
 */
export async function saveCustomerPortalSettings(
  input: unknown
): Promise<ActionResult<SaveCustomerPortalSettingsResult>> {
  return withAuth<SaveCustomerPortalSettingsResult>(
    async ({ userId, organizationId }) => {
      const data = customerPortalSettingsSchema.parse(input)

      const address = checkPortalSlug(data.slug)
      if (address.problem) return { saved: false, problem: address.problem }
      const slug = address.slug
      if (slug) {
        const holder = await db.organization.findUnique({
          where: { portalSlug: slug },
          select: { id: true },
        })
        if (holder && holder.id !== organizationId) return { saved: false, problem: 'slugTaken' }
      }

      if (data.enabled) await requireFeature(organizationId, 'customerPortal')

      const entries: Record<string, string> = {
        [SETTING_KEYS.PORTAL_ENABLED]: data.enabled ? 'true' : 'false',
        [SETTING_KEYS.PORTAL_DESCRIPTION]: data.description,
        [SETTING_KEYS.PORTAL_THEME]: data.theme,
        [SETTING_KEYS.PORTAL_ACCENT]: normalizeAccent(data.accent) ?? '',
        [SETTING_KEYS.PORTAL_COVER]: data.cover,
        [SETTING_KEYS.PORTAL_MESSAGES]: data.messages ? 'true' : 'false',
      }
      if (data.showTires !== undefined) {
        entries[SETTING_KEYS.PORTAL_SHOW_TIRES] = data.showTires ? 'true' : 'false'
      }

      for (const key of Object.keys(entries)) demoGuardSettingKey(key)
      // The cover photo must be this workshop's own upload.
      assertOwnUploads(entries, organizationId)
      await armFeatureHints(db, organizationId, userId, entries)
      const before = await settingValuesBefore(organizationId, Object.keys(entries))

      await db.$transaction([
        ...Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          })
        ),
        db.organization.update({ where: { id: organizationId }, data: { portalSlug: slug } }),
      ])

      // A cover photo replaced or removed: the file manager lets its file go,
      // unless something else still uses it.
      await releaseReplacedSettingFiles(organizationId, before, entries)

      // The chat or the portal switched on or off: customers with the portal
      // open are told now (after the write), not at their next reload.
      const switched = [SETTING_KEYS.PORTAL_MESSAGES, SETTING_KEYS.PORTAL_ENABLED].some(
        (key) => (before.get(key) ?? '') !== entries[key]
      )
      if (switched) publishPortalChatSwitched(organizationId)

      revalidatePath('/settings', 'layout')
      revalidatePath('/portal/[orgId]', 'layout')
      return { saved: true, slug }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) =>
        result.saved
          ? {
              action: 'settings.updateCustomerPortal',
              entity: 'Organization',
              message: 'Updated the customer portal settings',
              metadata: { slug: result.slug },
            }
          : null,
    }
  )
}
