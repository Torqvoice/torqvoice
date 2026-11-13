import { db, type TxClient } from '@/lib/db'
import { zonedParts } from '@/lib/timezone'

/**
 * The number a new job (work order, counter sale, recurring invoice) gets, in
 * the format the workshop chose under Settings, Invoice, Numbering.
 *
 * A number is the format with today's year (and month) written in, followed by
 * a running number: `{year}-` gives 2026-1043. The running number carries on
 * across years, so 2026-1050 is followed by 2027-1051. "Next invoice number"
 * in the same settings moves it forward once and is then cleared.
 *
 * The running number continues from the highest one already issued in this
 * format, whatever its year. It used to continue from the newest job alone,
 * which handed out numbers already in use when that job had none (an online
 * booking) or was numbered in another format (an import, a format changed and
 * changed back). When nothing in the current format exists yet, as right after
 * the format changes, it continues from the newest numbered job, as before.
 */

export const JOB_NUMBER_SETTING_KEYS = [
  'workshop.invoicePrefix',
  'workshop.invoiceStartNumber',
] as const

/** What the format is when the workshop has never set one. */
export const DEFAULT_JOB_NUMBER_FORMAT = '{year}-'

/** Where the running number starts when there is nothing to continue from. */
const FIRST_RUNNING_NUMBER = 1001

/**
 * At most this many digits are read as a running number: enough for any real
 * sequence, and short enough that a stray long number cannot overflow.
 */
const MAX_RUNNING_DIGITS = 15

/** The format with the year and month of `now` on the workshop's own calendar. */
export function jobNumberPrefix(format: string, now: Date, timeZone: string): string {
  const today = zonedParts(now, timeZone)
  return format
    .replace(/\{year\}/g, String(today.year))
    .replace(/\{month\}/g, String(today.month).padStart(2, '0'))
}

/**
 * A PostgreSQL regular expression matching any number written in this format,
 * whatever its year or month, with the running number as its one group.
 */
export function jobNumberPattern(format: string): string {
  const body = format
    .split(/(\{year\}|\{month\})/)
    .map((part) => {
      if (part === '{year}') return '[0-9]{4}'
      if (part === '{month}') return '[0-9]{2}'
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return `^${body}([0-9]{1,${MAX_RUNNING_DIGITS}})$`
}

/** The highest running number among this workshop's numbers in `format`. */
async function highestInFormat(organizationId: string, format: string): Promise<number | null> {
  const pattern = jobNumberPattern(format)
  const rows = await db.$queryRaw<{ highest: bigint | null }[]>`
    SELECT MAX(CAST(substring("invoiceNumber", ${pattern}::text) AS BIGINT)) AS highest
    FROM "public"."service_records"
    WHERE "organizationId" = ${organizationId} AND "invoiceNumber" ~ ${pattern}::text
  `
  const highest = rows[0]?.highest
  return highest === null || highest === undefined ? null : Number(highest)
}

/** The running number of the newest job that has a number at all. */
async function newestRunningNumber(organizationId: string): Promise<number | null> {
  const newest = await db.serviceRecord.findFirst({
    where: { organizationId, invoiceNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  })
  const digits = newest?.invoiceNumber?.match(new RegExp(`(\\d{1,${MAX_RUNNING_DIGITS}})$`))
  return digits ? Number.parseInt(digits[1], 10) : null
}

interface NumberingInput {
  organizationId: string
  /** The workshop's numbering settings, keys in JOB_NUMBER_SETTING_KEYS. */
  settings: Record<string, string | undefined>
  timeZone: string
  now?: Date
}

/**
 * Where the workshop's numbering stands: the prefix for today and the next
 * running number. For a caller that numbers many jobs at once, such as an
 * import, which counts up from `first` itself and clears "Next invoice number"
 * with `clearNextNumberSetting` when `usesNextNumberSetting` and it used one.
 */
export async function jobNumberSequence(
  input: NumberingInput
): Promise<{ prefix: string; first: number; usesNextNumberSetting: boolean }> {
  const { organizationId, settings, timeZone } = input
  const format = settings['workshop.invoicePrefix'] ?? DEFAULT_JOB_NUMBER_FORMAT
  const startNumber = Number.parseInt(settings['workshop.invoiceStartNumber'] || '0', 10) || 0

  const highest =
    (await highestInFormat(organizationId, format)) ?? (await newestRunningNumber(organizationId))
  // "Next invoice number" can move the sequence forward, never back onto
  // numbers already issued. 1001 is only where a workshop with nothing to
  // continue from starts: as a floor it sent a sequence started at 94 to
  // 1001 on its second job.
  const first =
    highest === null ? startNumber || FIRST_RUNNING_NUMBER : Math.max(startNumber, highest + 1)

  return {
    prefix: jobNumberPrefix(format, input.now ?? new Date(), timeZone),
    first,
    usesNextNumberSetting: startNumber > 0 && first === startNumber,
  }
}

/** "Next invoice number" is used once; after that the sequence carries on by itself. */
export async function clearNextNumberSetting(organizationId: string, writer?: TxClient) {
  await (writer ?? db).appSetting.updateMany({
    where: { organizationId, key: 'workshop.invoiceStartNumber' },
    data: { value: '' },
  })
}

/**
 * The next job number. Clears "Next invoice number" through `writer` once it
 * has been used, so a caller writing the job in a transaction clears it in
 * the same one.
 */
export async function nextJobNumber(
  input: NumberingInput & { writer?: TxClient }
): Promise<string> {
  const sequence = await jobNumberSequence(input)
  if (sequence.usesNextNumberSetting) {
    await clearNextNumberSetting(input.organizationId, input.writer)
  }
  return `${sequence.prefix}${sequence.first}`
}
