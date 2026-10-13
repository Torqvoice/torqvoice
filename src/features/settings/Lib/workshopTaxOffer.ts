import { db } from '@/lib/db'
import { ratesMatch } from '@/lib/tax'
import { readWorkshopTax, WORKSHOP_TAX_SETTING_KEYS, type WorkshopTax } from './workshopTax'

/**
 * Whether a work order or a quote should be offered the workshop's tax.
 *
 * A document keeps the rate it was created with, so one opened before the
 * workshop turned tax on, or before it changed its rate, is taxed at
 * something else: usually nothing. Left alone, the only way out was to know
 * that the rate can be typed into the totals, or to delete the job and
 * write it again. The page offers the workshop's rate instead, in one click.
 *
 * It is an offer and never automatic, because a total a customer has been
 * told must not move behind anyone's back. So it is made only where taking
 * it is safe: the workshop charges tax, the document's rate is not already
 * the workshop's, the customer is not exempt, and the document has neither
 * been finished nor gone to the customer.
 */

export interface WorkshopTaxOffer {
  /** The workshop's rate, which the document would be moved to. */
  rate: number
  /** The rate the document carries now. */
  currentRate: number
}

export type TaxOfferKind = 'workOrder' | 'quote'

/** The rule itself, on facts already read. Null when there is nothing to offer. */
export function taxOfferFor(
  tax: Pick<WorkshopTax, 'enabled' | 'rate'>,
  doc: {
    taxRate: number
    customerExempt: boolean
    /** Finished, or already with the customer. */
    settled: boolean
  }
): WorkshopTaxOffer | null {
  if (!tax.enabled || tax.rate <= 0) return null
  if (doc.customerExempt || doc.settled) return null
  if (ratesMatch(doc.taxRate, tax.rate)) return null
  return { rate: tax.rate, currentRate: doc.taxRate }
}

export async function loadWorkshopTaxSettings(organizationId: string): Promise<WorkshopTax> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [...WORKSHOP_TAX_SETTING_KEYS] } },
    select: { key: true, value: true },
  })
  return readWorkshopTax(Object.fromEntries(rows.map((row) => [row.key, row.value])))
}

/** The offer for one document, read from the database. */
export async function workshopTaxOffer(
  organizationId: string,
  kind: TaxOfferKind,
  id: string
): Promise<WorkshopTaxOffer | null> {
  const tax = await loadWorkshopTaxSettings(organizationId)
  if (!tax.enabled || tax.rate <= 0) return null

  if (kind === 'workOrder') {
    const record = await db.serviceRecord.findFirst({
      where: { id, organizationId },
      select: {
        taxRate: true,
        status: true,
        sentAt: true,
        issuedAt: true,
        customer: { select: { taxExempt: true } },
        vehicle: { select: { customer: { select: { taxExempt: true } } } },
      },
    })
    if (!record) return null
    return taxOfferFor(tax, {
      taxRate: record.taxRate,
      customerExempt: Boolean(record.customer?.taxExempt || record.vehicle?.customer?.taxExempt),
      settled: record.status === 'completed' || Boolean(record.sentAt || record.issuedAt),
    })
  }

  const quote = await db.quote.findFirst({
    where: { id, organizationId },
    select: {
      taxRate: true,
      status: true,
      sentAt: true,
      customer: { select: { taxExempt: true } },
    },
  })
  if (!quote) return null
  return taxOfferFor(tax, {
    taxRate: quote.taxRate,
    customerExempt: Boolean(quote.customer?.taxExempt),
    // Only a draft is still the workshop's alone.
    settled: quote.status !== 'draft' || Boolean(quote.sentAt),
  })
}
