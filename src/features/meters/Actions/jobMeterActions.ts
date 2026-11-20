'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { writeJobMeterReading } from '../Lib/jobMeterReading.server'
import { setJobMeterReadingSchema } from '../Schema/meterSchema'

/**
 * Saves one meter's reading on a work order as it is typed, the way the
 * Reference / PO box saves: on its own, not with the page's Save. Empty takes
 * the job's reading away.
 */
export async function setJobMeterReading(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = setJobMeterReadingSchema.parse(input)
      try {
        const result = await writeJobMeterReading({
          organizationId,
          userId,
          jobId: data.jobId,
          vehicleMeterId: data.vehicleMeterId,
          value: data.value,
          source: 'web',
        })
        revalidatePath('/vehicles')
        return result
      } catch (error) {
        if (error instanceof Error && error.name === 'InvalidMeterReadingError') {
          throw new Error((await getTranslations('vehicles.meters'))('invalidReading'))
        }
        throw error
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
