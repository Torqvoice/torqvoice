'use server'

import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { requestResearch, vehicleForCodes } from '../Lib/service.server'
import { researchFaultCodeSchema } from '../Schema/faultCodeSchema'

/**
 * Researches a fix for a code, or one meaning of a make's code, with AI and web search at the
 * code service, which keeps a specific, sourced answer for a person to check and records a
 * miss otherwise. An answer already there comes back at once, for any workshop. Opened from a
 * job, the job's car goes with it, never its plate or VIN.
 */
export async function researchFaultCode(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = researchFaultCodeSchema.parse(input)
      const car = await vehicleForCodes(organizationId, data.vehicleId)
      return requestResearch(organizationId, {
        code: data.code,
        meaning: data.meaning,
        vehicle: car
          ? { make: car.make, model: car.model, year: car.year, engine: car.engine ?? undefined }
          : null,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
