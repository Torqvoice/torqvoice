import { z } from 'zod'
import { ABSENCE_REASONS, daysBetween, isDateKey, isTime, minutesOf } from '../Lib/calendar'

/** The longest closure or absence one entry can cover. */
export const MAX_SPAN_DAYS = 366
export const MAX_FEEDS = 10
/** A file above this is refused before it is read; holiday calendars are a fraction of it. */
export const MAX_FEED_BYTES = 900_000

const dateKey = z.string().refine(isDateKey, 'Pick a valid date')
// An empty time means the whole day, whether it comes as '' or null.
const time = z
  .preprocess(
    (v) => (v === '' ? null : v),
    z.string().refine(isTime, 'Use a time like 08:30').nullish()
  )
  .transform((v) => v || null)

const stretchFields = {
  startDate: dateKey,
  endDate: dateKey,
  startTime: time,
  endTime: time,
}

/**
 * A stretch runs from one day to another, optionally starting and ending at
 * a time. Both days are included; on a single day the times must not cross.
 */
function checkStretch(
  value: { startDate: string; endDate: string; startTime: string | null; endTime: string | null },
  ctx: z.RefinementCtx
) {
  const days = daysBetween(value.startDate, value.endDate)
  if (days < 0) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The last day is before the first' })
  } else if (days >= MAX_SPAN_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'One entry can cover at most a year',
    })
  }
  if (
    days === 0 &&
    value.startTime &&
    value.endTime &&
    minutesOf(value.startTime) >= minutesOf(value.endTime)
  ) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The end time is before the start' })
  }
}

export const closureInputSchema = z
  .object({
    ...stretchFields,
    name: z.string().trim().min(1, 'Give the closure a name').max(80),
    repeatsYearly: z.boolean().default(false),
  })
  .superRefine(checkStretch)

export const absenceInputSchema = z
  .object({
    ...stretchFields,
    technicianId: z.string().min(1),
    reason: z.enum(ABSENCE_REASONS).default('holiday'),
    note: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine(checkStretch)

export const dayHoursSchema = z
  .object({
    open: z.boolean(),
    start: z.string().refine(isTime, 'Use a time like 08:00'),
    end: z.string().refine(isTime, 'Use a time like 16:00'),
  })
  .refine((d) => !d.open || minutesOf(d.start) < minutesOf(d.end), {
    message: 'Closing time must be after opening time',
    path: ['end'],
  })

export const weekHoursSchema = z.array(dayHoursSchema).length(7)

export const holidayCountrySchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, 'Pick a country'),
  regions: z
    .array(z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/))
    .max(60)
    .default([]),
})

export const feedUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => v.replace(/^webcals?:\/\//i, 'https://'))
  .refine((v) => /^https?:\/\//i.test(v), 'Paste a link starting with https:// or webcal://')

export type ClosureInput = z.infer<typeof closureInputSchema>
export type AbsenceInput = z.infer<typeof absenceInputSchema>
