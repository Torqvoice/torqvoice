'use server'

import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { sendReport, vehicleForCodes } from '../Lib/service.server'
import { reportFaultCodeSchema } from '../Schema/faultCodeSchema'

/**
 * "This doesn't match": tells the code service a meaning looks wrong. Sends
 * the code, the meaning's version and language, the reason, the note and
 * the vehicle's make, model, year and engine; never a VIN, a plate or a
 * customer. `sent` is false when the service could not
 * take it, and nothing is remembered then.
 */
export async function reportFaultCodeMeaning(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = reportFaultCodeSchema.parse(input)
      const vehicle = await vehicleForCodes(organizationId, data.vehicleId)
      const report = await sendReport(organizationId, {
        code: data.code,
        version: data.version,
        lang: data.lang,
        reason: data.reason,
        note: data.note || undefined,
        vehicle: vehicle
          ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine }
          : null,
      })
      return { sent: report !== null, report }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
