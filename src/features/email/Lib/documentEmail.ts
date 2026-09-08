/**
 * How a document leaves the building by email.
 *
 * Two ways to send an invoice, a quote or an inspection report. With the PDF
 * attached, which is what a customer who prints things wants. Or as a link to
 * the shared copy, which is what a workshop that chases unpaid invoices
 * wants: the link is the only thing that can be seen to have been opened, so
 * the viewed counter on the document finally means something. A mail carrying
 * the PDF is read in the mail client and the link never gets clicked.
 *
 * The workshop picks a default in settings and either send can override it.
 * The words of the mail itself come from the email template for the kind;
 * see sendTemplatedMail.
 */

/** Attaching is the old behaviour, so an unset setting keeps it. */
export function attachPdfDefault(settings: Record<string, string>): boolean {
  return settings['email.attachPdf'] !== 'false'
}

/** What this particular send does: the caller's choice, else the workshop's. */
export function resolveAttachPdf(
  settings: Record<string, string>,
  override: boolean | undefined
): boolean {
  return override ?? attachPdfDefault(settings)
}
