'use server'

import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { withdrawSharedFix } from '../Lib/service.server'
import { withdrawFixSchema } from '../Schema/faultCodeSchema'

/**
 * Withdraws a fix this workshop shared: the code service deletes it with its
 * photos, whether it was waiting for review or already published. Only a fix
 * this workshop sent can be withdrawn.
 */
export async function withdrawFaultCodeFix(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = withdrawFixSchema.parse(input)
      const outcome = await withdrawSharedFix(organizationId, data.code, data.id)
      if (outcome === 'unavailable') {
        throw new Error('The fix could not be withdrawn right now. Try again in a moment.')
      }
      revalidatePath(`/fault-codes/${data.code}`)
      return { withdrawn: outcome === 'withdrawn' }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
