import 'server-only'

import { db } from '@/lib/db'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import { meterAskLimit } from './meterAsk'
import { type JobMeterView, jobMeterViews } from './meters.server'

/**
 * A job's meter as the technician app reads it: the web's view, and
 * `askAbove`, how far above `last` a new reading may go before the app asks
 * "Are you sure this reading is correct?", the question the web asks.
 *
 * The rule, as `readingNeedsAnswer` in vehicleReading.ts applies it: ask when
 * `last` is above 0 and the reading minus `last` is more than `askAbove`
 * (strictly), unless the value is the one already saved on the job or the
 * one the technician already said yes to. `askAbove` comes from the meter's
 * unit (meterAsk.ts): the odometer's distance limit for km and miles, the
 * hours limit for hours, and null, never ask, for any other unit. Only a
 * question for the screen: the server takes any reading.
 */
export interface AppJobMeter extends JobMeterView {
  askAbove: number | null
}

export function withAskAbove(meters: JobMeterView[]): AppJobMeter[] {
  return meters.map((meter) => ({ ...meter, askAbove: meterAskLimit(meter.unit) }))
}

/**
 * The job's meters for the app, with this job's reading of each and the last
 * one before it. Empty while meters are off or the job has no vehicle. The
 * job's dates are looked up unless the caller already has them.
 */
export async function appJobMeters(
  organizationId: string,
  job: {
    id: string
    vehicleId: string | null
    dates?: { startDateTime: Date | null; serviceDate: Date }
  }
): Promise<AppJobMeter[]> {
  if (!job.vehicleId) return []
  const dates =
    job.dates ??
    (await db.serviceRecord.findFirst({
      where: { id: job.id, organizationId },
      select: { startDateTime: true, serviceDate: true },
    }))
  if (!dates) return []
  return withAskAbove(
    await jobMeterViews(organizationId, {
      id: job.id,
      vehicleId: job.vehicleId,
      readAt: jobReadingDate(dates),
    })
  )
}
