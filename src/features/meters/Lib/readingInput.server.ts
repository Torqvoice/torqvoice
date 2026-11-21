import 'server-only'

import { getTranslations } from 'next-intl/server'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDate, zonedDayKey } from '@/lib/timezone'
import { parseMeterValue, roundMeterValue } from './meterValue'

/**
 * When a reading typed on the vehicle was taken. Today's is now, so it comes
 * after a job earlier today; another day's is that day at noon on the
 * workshop's clock, so it falls on that day wherever it is read.
 */
export async function readingTime(
  organizationId: string,
  readOn: string | undefined
): Promise<Date> {
  const now = new Date()
  if (!readOn) return now
  const timeZone = await workshopTimeZone(organizationId)
  if (readOn === zonedDayKey(now, timeZone)) return now
  const [y, m, d] = readOn.split('-').map(Number)
  return zonedDate(y, m, d, 12, 0, timeZone)
}

/** A typed reading as a number, or the person is told it is not one. */
export async function readingValue(typed: string | number): Promise<number> {
  const value = parseMeterValue(typed)
  if (value === null) {
    throw new Error((await getTranslations('vehicles.meters'))('invalidReading'))
  }
  return roundMeterValue(value)
}
