'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { demoGuardSettingKey } from '@/lib/demo'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { READY_MADE_FIELD_KEYS, READY_MADE_FIELDS } from '../Lib/readyMadeFields'

const inputSchema = z.object({
  field: z.enum(READY_MADE_FIELDS),
  enabled: z.boolean(),
})

/**
 * Turns one of the ready-made fields (Reference / PO, Fleet / unit number) on
 * or off, from its switch on Settings, Invoice & Quotes, Custom Fields. Saved
 * as soon as it is flipped. Both belong to the plans that have custom fields,
 * so a workshop without them is refused here too, not only by the page.
 */
export async function setReadyMadeField(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { field, enabled } = inputSchema.parse(input)
      await requireFeature(organizationId, 'customFields')
      const key = READY_MADE_FIELD_KEYS[field]
      demoGuardSettingKey(key)
      const value = enabled ? 'true' : 'false'
      await db.appSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: { userId, organizationId, key, value },
      })
      // The whole app reads these: the work order, the vehicle, the designer.
      revalidatePath('/', 'layout')
      return { field, enabled }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
