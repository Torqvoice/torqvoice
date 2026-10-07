/**
 * The translated strings a printed or shared document uses, resolved once for
 * a customer's locale, with the same marine and tax-label adjustments the PDF
 * routes have always applied.
 */

import { invoiceLabels } from '../Lib/invoiceLabels'
import { withOrgNumberLabel } from '../Lib/labelOverrides'
import { isMarineWorkshop, type PdfMessages, withMarineDocumentLabels } from '../Lib/marineLabels'
import { withWorkOrderLabels } from '../Lib/workOrderLabels'

/**
 * Which document's wording wins where the invoice and the quote differ. A
 * work order takes the invoice's vocabulary and lays its own on top.
 */
export type PrintDocumentType = 'invoice' | 'quote' | 'work_order'

async function loadPdfMessages(locale: string): Promise<PdfMessages> {
  try {
    return (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    return (await import(`../../../../messages/en/pdf.json`)).default
  }
}

export async function loadPrintLabels(
  locale: string,
  settingsMap: Record<string, string>,
  documentType: PrintDocumentType = 'invoice'
): Promise<Record<string, string>> {
  const pdfMessages = await loadPdfMessages(locale)
  const quote = documentType === 'quote'
  // The quote's wording over the invoice's, with the inspection's vocabulary
  // under both for the result sections a design can switch on.
  let labels: Record<string, string> = invoiceLabels(pdfMessages, quote ? 'quote' : 'invoice')

  if (isMarineWorkshop(settingsMap)) {
    labels = withMarineDocumentLabels(labels, pdfMessages, quote ? 'quote' : 'invoice')
  }
  if (documentType === 'work_order') {
    labels = withWorkOrderLabels(labels, pdfMessages.workOrder, pdfMessages.inspection)
  }

  const customTaxLabel = settingsMap['workshop.taxLabel']?.trim()
  if (customTaxLabel) {
    labels.tax = `${customTaxLabel} ({rate}%)`
  }

  return withOrgNumberLabel(labels, settingsMap['workshop.orgNumberLabel'])
}
