import { db } from '@/lib/db'
import { INVOICE_ISSUED_KEY, SAMPLE_DATA_IDS_KEY, parseSampleDataIds } from './onboardingKeys'

/**
 * Records that the organization has produced a real invoice PDF.
 *
 * Downloading an invoice leaves no trace in the data, so the getting-started
 * checklist cannot detect it from counts; the invoice PDF route calls this
 * instead. Best-effort and cheap: once the marker exists the first read
 * short-circuits, and sample records never set it.
 */
export async function markInvoiceIssued(
  organizationId: string,
  userId: string,
  serviceRecordId: string
): Promise<void> {
  try {
    const rows = await db.appSetting.findMany({
      where: {
        organizationId,
        key: { in: [INVOICE_ISSUED_KEY, SAMPLE_DATA_IDS_KEY] },
      },
      select: { key: true, value: true },
    })
    const byKey = new Map(rows.map((r) => [r.key, r.value]))
    if (byKey.get(INVOICE_ISSUED_KEY) === 'true') return

    const sampleIds = parseSampleDataIds(byKey.get(SAMPLE_DATA_IDS_KEY))
    if (sampleIds.serviceRecords.includes(serviceRecordId)) return

    await db.appSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: INVOICE_ISSUED_KEY },
      },
      create: {
        organizationId,
        key: INVOICE_ISSUED_KEY,
        value: 'true',
        userId,
      },
      update: { value: 'true' },
    })
  } catch (error) {
    console.error('[markInvoiceIssued] Failed:', error instanceof Error ? error.message : error)
  }
}
