'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { HEAVY_VEHICLE_SETUP_KEY } from '../Lib/heavyVehicleSetup.server'

const SETTINGS_UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]

async function setCard(organizationId: string, userId: string, value: 'open' | 'dismissed') {
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: HEAVY_VEHICLE_SETUP_KEY } },
    update: { value },
    create: { organizationId, userId, key: HEAVY_VEHICLE_SETUP_KEY, value },
  })
  revalidatePath('/settings/custom-fields')
}

/**
 * Opens the fleet and heavy vehicle setup checklist on Settings, Custom
 * Fields. On a plan without custom fields it is refused as a plan gate, so
 * the person is shown the upgrade dialog rather than a list of locked links.
 */
export async function openHeavyVehicleSetup() {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      await setCard(organizationId, userId, 'open')
      return { open: true }
    },
    { requiredPermissions: SETTINGS_UPDATE }
  )
}

/** Puts the checklist away; it can be opened again the same way. */
export async function dismissHeavyVehicleSetup() {
  return withAuth(
    async ({ organizationId, userId }) => {
      await setCard(organizationId, userId, 'dismissed')
      return { open: false }
    },
    { requiredPermissions: SETTINGS_UPDATE }
  )
}
