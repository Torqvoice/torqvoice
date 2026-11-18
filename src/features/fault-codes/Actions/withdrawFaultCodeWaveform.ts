'use server'

import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { withdrawSharedWaveform } from '../Lib/service.server'
import { withdrawWaveformSchema } from '../Schema/faultCodeSchema'

/**
 * Takes back a waveform this workshop shared: the code service deletes it with its files,
 * waiting for review or published. Only one this workshop shared can be taken back.
 */
export async function withdrawFaultCodeWaveform(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = withdrawWaveformSchema.parse(input)
      const outcome = await withdrawSharedWaveform(organizationId, data.code, data.id)
      if (outcome === 'unavailable') {
        throw new Error('The waveform could not be taken back right now. Try again in a moment.')
      }
      revalidatePath('/fault-codes')
      return { withdrawn: outcome === 'withdrawn' }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
