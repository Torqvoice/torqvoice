/**
 * The translated strings a printed or shared document uses, resolved once for
 * a customer's locale, with the same marine and tax-label adjustments the PDF
 * routes have always applied.
 */

type PdfMessages = Record<string, Record<string, string>>

async function loadPdfMessages(locale: string): Promise<PdfMessages> {
  try {
    return (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    return (await import(`../../../../messages/en/pdf.json`)).default
  }
}

export async function loadPrintLabels(
  locale: string,
  settingsMap: Record<string, string>
): Promise<Record<string, string>> {
  const pdfMessages = await loadPdfMessages(locale)
  const labels: Record<string, string> = {
    ...pdfMessages.invoice,
    ...pdfMessages.common,
  }

  const serviceType = settingsMap['workshop.serviceType'] || 'automotive'
  if (serviceType === 'marine') {
    if (pdfMessages.invoice.mileageMarine) labels.mileage = pdfMessages.invoice.mileageMarine
    if (pdfMessages.invoice.vinMarine) labels.vin = pdfMessages.invoice.vinMarine
    if (pdfMessages.invoice.plateMarine) labels.plate = pdfMessages.invoice.plateMarine
    if (pdfMessages.invoice.vehicleMarine) labels.vehicle = pdfMessages.invoice.vehicleMarine
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
