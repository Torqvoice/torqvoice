import 'server-only'
import { getTranslations } from 'next-intl/server'
import { invoiceAwaitsReference } from './referenceSetting'

/**
 * Refuses to hand an invoice to the customer while it waits for their
 * reference: the workshop uses the Reference / PO field, the customer is
 * marked "PO required", and the job has none.
 *
 * Called first by everything that sends the invoice out (email, a texted or
 * WhatsApp link, the share link and the pay code that is made from it),
 * before anything is issued, stamped or delivered. It is deliberately not in
 * issueInvoice: taking a payment issues the invoice too, and money is never
 * turned away for a missing number.
 *
 * The sentence is for whoever is signed in, so it is in their language.
 */
export async function assertInvoiceHasRequiredReference(
  organizationId: string,
  serviceRecordId: string
): Promise<void> {
  if (!(await invoiceAwaitsReference(organizationId, serviceRecordId))) return
  const t = await getTranslations('service.reference')
  throw new Error(t('requiredToInvoice'))
}
