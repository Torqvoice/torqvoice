'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { vehicleFileUrls } from '@/lib/files/collect'
import { releaseFiles } from '@/lib/files/manager'
import {
  deleteCustomFieldValuesOf,
  workOrderIdsOfVehicles,
} from '@/features/custom-fields/Lib/deleteCustomFieldValues'

export async function deleteVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      // Its files are read while the rows exist and let go once they are gone:
      // this path used to leave every photo of every job on disk.
      const files = await vehicleFileUrls(organizationId, [vehicleId])
      // Its work orders go with it by cascade; their custom field values hang
      // on the work order's id alone and have to be removed by name.
      const workOrderIds = await workOrderIdsOfVehicles(organizationId, [vehicleId])
      const result = await db.$transaction(async (tx) => {
        const deleted = await tx.vehicle.deleteMany({
          where: { id: vehicleId, organizationId },
        })
        await deleteCustomFieldValuesOf(tx, organizationId, 'service_record', workOrderIds)
        // And the vehicle's own.
        await deleteCustomFieldValuesOf(tx, organizationId, 'vehicle', [vehicleId])
        return deleted
      })
      if (result.count === 0) throw new Error('Vehicle not found')
      await releaseFiles(files, { organizationId, reason: 'vehicle deleted' })

      revalidatePath('/')
      revalidatePath('/vehicles')

      return { success: true as const }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
