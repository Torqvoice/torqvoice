import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'

/**
 * When a reading counts as taken. One taken on a job is dated by the job (when
 * it starts, else its service day), read from the job as it is now, so a job
 * that is rescheduled carries its readings with it and there is no second date
 * to keep in step. Any other reading is dated when it was typed for.
 */
export function effectiveReadAt(row: {
  readAt: Date
  serviceRecord?: { startDateTime: Date | null; serviceDate: Date } | null
}): Date {
  return row.serviceRecord ? jobReadingDate(row.serviceRecord) : row.readAt
}

/** The job fields `effectiveReadAt` needs, for a Prisma select. */
export const READING_JOB_DATES = { startDateTime: true, serviceDate: true } as const
