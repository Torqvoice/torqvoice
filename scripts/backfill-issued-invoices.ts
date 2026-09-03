/**
 * Issues every invoice that reached a customer before issuing existed.
 *
 * An invoice is issued the moment it becomes the customer's document: sent,
 * shared, paid or locked. From then on it prints from what it was issued
 * with, not from live settings. Invoices from before this existed have no
 * such record; the app takes one the first time each is printed again, but
 * that leaves a window in which a workshop changes its address, logo, terms
 * or title and an old invoice not yet reprinted picks the change up. This
 * closes the window in one pass, right after the migration lands.
 *
 * Running it twice is safe: an invoice with an issue is left alone. The
 * capture reads the logo from the uploads directory, so it must run where
 * the app's uploads are mounted, with the app's DATABASE_URL.
 *
 *   npx tsx scripts/backfill-issued-invoices.ts            # report only
 *   npx tsx scripts/backfill-issued-invoices.ts --write    # issue them
 */

import { db } from '@/lib/db'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'

async function main() {
  const write = process.argv.includes('--write')

  const candidates = await db.serviceRecord.findMany({
    where: {
      issuedAt: null,
      organizationId: { not: null },
      OR: [{ sentAt: { not: null } }, { manuallyPaid: true }, { payments: { some: {} } }],
    },
    select: { id: true, organizationId: true, invoiceNumber: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`${candidates.length} invoice(s) reached a customer without an issue on record`)
  if (!write) {
    console.log('Dry run. Pass --write to issue them.')
    return
  }

  let issued = 0
  let failed = 0
  for (const record of candidates) {
    if (!record.organizationId) continue
    try {
      const done = await issueInvoice(record.id, record.organizationId, 'backfill')
      if (done) issued += 1
    } catch (err) {
      failed += 1
      console.error(`  ${record.invoiceNumber ?? record.id}: ${(err as Error).message}`)
    }
  }
  console.log(`issued ${issued}, failed ${failed}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
