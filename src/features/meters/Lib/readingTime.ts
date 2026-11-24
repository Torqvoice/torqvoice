import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'

/**
 * When a reading counts as taken. One taken on a job is dated by the job (when
 * it starts, else its service day), read from the job as it is now, so a job
 * that is rescheduled carries its readings with it and there is no second date
 * to keep in step. Any other reading is dated when it was typed for.
 *
 * Never in the future, though: a job opened after closing time is booked into
 * tomorrow morning, and the reading taken as the car came in was dated
 * tomorrow, in the meter's history and against the readings around it. While
 * the job's time is still ahead, its reading counts from when it was typed;
 * once that time comes (or the job is completed, which ends its booking now),
 * it follows the job again. A reading typed before a job was moved to a day
 * since gone by still goes with the job.
 */
export function effectiveReadAt(
  row: {
    readAt: Date
    createdAt: Date
    serviceRecord?: { startDateTime: Date | null; serviceDate: Date } | null
  },
  now = new Date()
): Date {
  if (!row.serviceRecord) return row.readAt
  const jobDate = jobReadingDate(row.serviceRecord)
  return jobDate.getTime() > now.getTime() && jobDate.getTime() > row.createdAt.getTime()
    ? row.createdAt
    : jobDate
}

/** The job fields `effectiveReadAt` needs, for a Prisma select. */
export const READING_JOB_DATES = { startDateTime: true, serviceDate: true } as const
