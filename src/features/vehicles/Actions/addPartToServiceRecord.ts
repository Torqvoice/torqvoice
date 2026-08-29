'use server'

import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { addPart, type AddPartInput } from '../Lib/addPart'

/**
 * Web-side wrapper. The work itself lives in `../Lib/addPart` so the
 * technician API adds parts the same way, stock movements included.
 */
export async function addPartToServiceRecord(input: AddPartInput) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { part, vehicleId } = await addPart({ organizationId, userId, input })

      revalidatePath(
        vehicleId
          ? `/vehicles/${vehicleId}/service/${input.serviceRecordId}`
          : `/sales/${input.serviceRecordId}`
      )
      if (input.inventoryPartId) await onInventoryChanged(organizationId)

      return part
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
