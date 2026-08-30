/**
 * The translated strings a printed or shared document uses, resolved once for
 * a customer's locale, with the same marine and tax-label adjustments the PDF
 * routes have always applied.
 */

type PdfMessages = Record<string, Record<string, string>>

/** Which document's wording wins where the invoice and the quote differ. */
export type PrintDocumentType = 'invoice' | 'quote'

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
  const labels: Record<string, string> = {
    ...pdfMessages.invoice,
    ...(quote ? pdfMessages.quote : {}),
    ...pdfMessages.common,
  }

  const serviceType = settingsMap['workshop.serviceType'] || 'automotive'
  if (serviceType === 'marine') {
    const source = quote ? { ...pdfMessages.invoice, ...pdfMessages.quote } : pdfMessages.invoice
    if (source.mileageMarine) labels.mileage = source.mileageMarine
    if (source.vinMarine) labels.vin = source.vinMarine
    if (source.plateMarine) labels.plate = source.plateMarine
    if (source.vehicleMarine) labels.vehicle = source.vehicleMarine
    // Engine hours, not distance.
    labels.km = 'hrs'
    labels.mi = 'hrs'
  }

  const customTaxLabel = settingsMap['workshop.taxLabel']?.trim()
  if (customTaxLabel) {
    labels.tax = `${customTaxLabel} ({rate}%)`
  }

  return labels
}
