/**
 * The translated strings an inspection certificate prints, shared by the
 * workshop's download and the customer's public link so both say the same.
 */

type Labels = Record<string, string>

/**
 * The inspection labels for a locale's `pdf.json`, with the marine vocabulary
 * (vessel, HIN, registration, engine hours, a vessel title and footer) for a
 * workshop that services boats.
 */
export function inspectionPrintLabels(
  pdfMessages: Record<string, Labels>,
  settingsMap: Record<string, string>
): Labels {
  const inspection = pdfMessages.inspection ?? {}
  const labels: Labels = { ...inspection, ...(pdfMessages.common ?? {}) }

  if ((settingsMap['workshop.serviceType'] || 'automotive') !== 'marine') return labels

  if (inspection.mileageMarine) labels.mileage = inspection.mileageMarine
  if (inspection.vinMarine) labels.vin = inspection.vinMarine
  if (inspection.plateMarine) labels.plate = inspection.plateMarine
  if (inspection.vehicleMarine) labels.vehicle = inspection.vehicleMarine
  if (inspection.titleMarine) labels.title = inspection.titleMarine
  if (inspection.footerTextMarine) labels.footerText = inspection.footerTextMarine
  return labels
}
