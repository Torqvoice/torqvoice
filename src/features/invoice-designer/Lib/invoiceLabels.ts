/**
 * The words an invoice or a quote prints, as the document builder expects
 * them, from the whole `pdf.json`.
 *
 * A quote sheet is an invoice sheet with different wording in a handful of
 * places, and the two are drawn by the same builder. Layering the quote over
 * the invoice means every shared label (column heads, panel titles, warranty)
 * is translated for a quote too, instead of falling through to English.
 *
 * The inspection's vocabulary lies underneath both: the results of the
 * inspection behind a job or a quote print through the certificate's blocks,
 * which ask for the certificate's words (the grades, the column heads, "All
 * results"). Underneath, so no word an invoice or a quote already prints
 * changes. Used by the print path and the designer's preview alike, so both
 * say the same thing.
 */

type Labels = Record<string, string>

export function invoiceLabels(
  pdfMessages: Record<string, Labels | undefined>,
  documentType: 'invoice' | 'quote' = 'invoice'
): Labels {
  return {
    ...(pdfMessages.inspection ?? {}),
    ...(pdfMessages.invoice ?? {}),
    ...(documentType === 'quote' ? (pdfMessages.quote ?? {}) : {}),
    ...(pdfMessages.common ?? {}),
  }
}
