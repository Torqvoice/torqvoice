import { db, type TxClient } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { invoiceLineWords, treatmentNames } from './serverMessages'
import { billableTreatments, parseTreatmentPrices } from './treatments'

/**
 * The service lines the tire hotel puts on a job: the storage fee and the
 * prep work. One place builds them, because they reach a job from two
 * directions, a job raised from a stored set and a set stored from a job, and
 * the customer should read the same line either way.
 */

export type TireJobLine = {
  description: string
  hours: number
  rate: number
  total: number
  pricingType: 'service'
}

/**
 * The storage fee as a flat service line, in the workshop's language.
 *
 * Priced per job rather than by the hour, so it prints as one figure with the
 * period beside it. Nothing schedules this: it is charged when the tires are
 * billed, which is the moment somebody is looking at the account anyway.
 */
export async function storageLine(
  set: { size: string | null; quantity: number },
  data: { storageAmount?: number; storageFrom?: Date; storageTo?: Date }
): Promise<TireJobLine> {
  const amount = Math.round((data.storageAmount ?? 0) * 100) / 100
  const words = await invoiceLineWords()

  // An open-ended period is the normal case: the shop knows when the tires
  // arrived and not when they will be collected, and inventing an end date
  // would print a promise on the invoice.
  const from = data.storageFrom?.toISOString().slice(0, 10)
  const to = data.storageTo?.toISOString().slice(0, 10)
  const period = from ? (to ? `${from} - ${to}` : words.fromDate.replace('{date}', from)) : null

  return {
    description: [words.storage, set.size, `${set.quantity} ${words.pieces}`, period]
      .filter(Boolean)
      .join(' · '),
    hours: 1,
    rate: amount,
    total: amount,
    pricingType: 'service' as const,
  }
}

export async function billablePrep(
  organizationId: string,
  treatments: { type: string; status: string }[]
) {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: { organizationId, key: SETTING_KEYS.TIRE_HOTEL_TREATMENT_PRICES },
    },
    select: { value: true },
  })
  return billableTreatments(treatments, parseTreatmentPrices(setting?.value))
}

/**
 * Prep lines for a job, priced from settings.
 *
 * The work was agreed when the set was checked in, so it should reach the
 * bill without anyone retyping it. Only treatments the shop has put a price
 * against produce a line, which keeps washing off the invoice at shops that
 * fold it into the storage fee.
 *
 * The names are loaded here rather than passed in from the browser: this text
 * ends up on an invoice, and invoice wording should not be whatever a client
 * happened to send. The prices are read here for the same reason.
 */
export async function treatmentLines(
  organizationId: string,
  treatments: { type: string; status: string }[],
  only?: string[]
): Promise<TireJobLine[]> {
  const names = await treatmentNames()
  const billable = await billablePrep(organizationId, treatments)
  const wanted = only ? new Set(only) : null

  return billable
    .filter((line) => !wanted || wanted.has(line.type))
    .map((line) => ({
      description: names[line.type] ?? line.type,
      // A flat service line, not hours: prep is priced per job, and an hourly
      // line would invite someone to multiply it by a duration nobody tracked.
      hours: 1,
      rate: line.price,
      total: line.price,
      pricingType: 'service' as const,
    }))
}

/**
 * What a check-in started from a job asks to have put on that job. Absent
 * means nothing is billed, which is every check-in from the tire hotel itself.
 */
export type CheckInBilling = {
  /** Present when the storage fee is billed; the figure the desk settled on. */
  storageAmount?: number
  /** Which of the requested prep to bill. Prices come from settings. */
  treatments?: string[]
}

/**
 * The lines a check-in adds to its job, built before the transaction opens:
 * they read settings and translations, and neither belongs inside one.
 */
export async function checkInJobLines(
  organizationId: string,
  set: { size: string | null; quantity: number },
  requested: string[],
  billing: CheckInBilling | null | undefined
): Promise<TireJobLine[]> {
  if (!billing) return []
  const lines = billing.treatments?.length
    ? await treatmentLines(
        organizationId,
        requested.map((type) => ({ type, status: 'pending' })),
        billing.treatments
      )
    : []
  if (billing.storageAmount !== undefined) {
    lines.push(
      await storageLine(set, { storageAmount: billing.storageAmount, storageFrom: new Date() })
    )
  }
  return lines
}

/** Writes those lines and brings the job's totals up to date. In a transaction. */
export async function addLinesToJob(
  tx: TxClient,
  serviceRecordId: string,
  lines: TireJobLine[]
): Promise<void> {
  if (lines.length === 0) return
  await tx.serviceLabor.createMany({
    data: lines.map((line) => ({ ...line, serviceRecordId })),
  })
  await retotalServiceRecord(serviceRecordId, tx)
}
