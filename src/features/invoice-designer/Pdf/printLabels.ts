/**
 * The translated strings a printed or shared document uses, resolved once for
 * a customer's locale, with the same marine and tax-label adjustments the PDF
 * routes have always applied.
 */

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
  // A quote sheet is an invoice sheet with different wording in a handful of
  // places, and the two are drawn by the same builder. Layering the quote over
  // the invoice means every shared label (column heads, panel titles, warranty)
  // is translated for a quote too, instead of falling through to English.
  let labels: Record<string, string> = {
    ...pdfMessages.invoice,
    ...(quote ? pdfMessages.quote : {}),
    ...pdfMessages.common,
  }

  if (isMarineWorkshop(settingsMap)) {
    labels = withMarineDocumentLabels(labels, pdfMessages, quote ? 'quote' : 'invoice')
  }
  if (documentType === 'work_order') {
    labels = withWorkOrderLabels(labels, pdfMessages.workOrder)
  }

  const customTaxLabel = settingsMap['workshop.taxLabel']?.trim()
  if (customTaxLabel) {
    labels.tax = `${customTaxLabel} ({rate}%)`
  }

  return withOrgNumberLabel(labels, settingsMap['workshop.orgNumberLabel'])
}
