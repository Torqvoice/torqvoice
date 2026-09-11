import { db } from '@/lib/db'
import { SAMPLE_DATA_IDS_KEY, parseSampleDataIds } from '@/features/onboarding/Lib/onboardingKeys'

/**
 * Customers that count toward the plan limit: the ones the workshop created.
 *
 * The seeded sample customers are ours, not theirs. Counted, they ate three
 * of the five slots the old free plan had, and a new workshop was refused on
 * its third real customer while the settings page promised five. Every limit
 * check and every usage meter goes through here so they cannot disagree.
 */
export async function countCustomersTowardLimit(organizationId: string): Promise<number> {
  const row = await db.appSetting.findFirst({
    where: { organizationId, key: SAMPLE_DATA_IDS_KEY },
    select: { value: true },
  })
  const sampleIds = parseSampleDataIds(row?.value).customers
  return db.customer.count({
    where: {
      organizationId,
      ...(sampleIds.length > 0 ? { id: { notIn: sampleIds } } : {}),
    },
  })
}
