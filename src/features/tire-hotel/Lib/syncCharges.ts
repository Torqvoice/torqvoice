import type { Prisma } from '@/generated/prisma/client'
import { duePeriods, parseExtras, periodAmount } from './billing'

/**
 * Creates the charge rows for every period that has fallen due but has none.
 *
 * Driven by what is already recorded rather than a cursor on the agreement,
 * so running it twice, or late after downtime, still bills each period once.
 *
 * Shared by the agreement actions and the nightly sweep on purpose: two
 * implementations of "which periods are owed" would eventually disagree, and
 * the way that shows up is a customer billed twice for one winter.
 */
export async function syncCharges(
  tx: Prisma.TransactionClient,
  agreementId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<number> {
  const agreement = await tx.tireStorageAgreement.findFirst({
    where: { id: agreementId, organizationId },
    include: { charges: { select: { periodStart: true } } },
  })
  if (!agreement) return 0

  const extras = parseExtras(agreement.extras)
  const amount = periodAmount(agreement.price, extras)

  const due = duePeriods(
    agreement,
    agreement.charges.map((c) => c.periodStart),
    now
  )
  if (due.length === 0) return 0

  await tx.tireStorageCharge.createMany({
    data: due.map((period) => ({
      agreementId: agreement.id,
      organizationId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount,
      status: 'pending',
    })),
    skipDuplicates: true,
  })

  return due.length
}
