/**
 * The words a boat yard's invoice or quote uses where a garage's says vehicle,
 * VIN, plate and mileage.
 *
 * Pure and free of server imports, so the print path and the designer's
 * preview resolve the same wording from the same `pdf.json`.
 */

type Labels = Record<string, string>

/** A locale's `pdf.json`, section by section. */
export type PdfMessages = Record<string, Labels>

/** Whether the workshop services boats rather than road vehicles. */
export function isMarineWorkshop(settingsMap: Record<string, string>): boolean {
  return (settingsMap['workshop.serviceType'] || 'automotive') === 'marine'
}

/**
 * The labels with the marine vocabulary swapped in: vessel, HIN, registration
 * and engine hours. A quote has no marine keys of its own and takes the
 * invoice's, the same way it takes the invoice's column heads.
 */
export function withMarineDocumentLabels(
  labels: Labels,
  pdfMessages: PdfMessages,
  documentType: 'invoice' | 'quote' = 'invoice'
): Labels {
  const source: Labels = {
    ...(pdfMessages.invoice ?? {}),
    ...(documentType === 'quote' ? (pdfMessages.quote ?? {}) : {}),
  }
  const next = { ...labels }
  if (source.vehicleMarine) next.vehicle = source.vehicleMarine
  if (source.vinMarine) next.vin = source.vinMarine
  if (source.plateMarine) next.plate = source.plateMarine
  if (source.mileageMarine) next.mileage = source.mileageMarine
  // Engine hours, not distance, whichever unit system the workshop chose.
  const unit = source.mileageUnitMarine || 'hrs'
  next.km = unit
  next.mi = unit
  return next
}
