/**
 * The words a certificate prints, as the document builder expects them.
 *
 * The builder is the invoice's: its title strip asks for `invoiceNumberLabel`,
 * `dateLabel` and `dueDateLabel`, and its panels for `billTo` and `vehicle`.
 * A certificate answers those with its own words, so the same strip reads
 * "Certificate No. / Date of test / Next test due" without the builder
 * learning what an inspection is. Used by the print path and the designer's
 * preview alike, so both say the same thing.
 */
export function certificateLabels(
  pdfMessages: Record<string, Record<string, string> | undefined>,
  inspectionLabels?: Record<string, string>
): Record<string, string> {
  const inspection = inspectionLabels ?? pdfMessages.inspection ?? {}
  const common = pdfMessages.common ?? {}
  const invoice = pdfMessages.invoice ?? {}
  return {
    // The shared vocabulary first (tel, vin, plate, notes), then the
    // certificate's own on top, then the strip and panel captions.
    ...invoice,
    ...common,
    ...inspection,
    billTo: inspection.customer || invoice.billTo || 'Customer',
    invoiceNumberLabel: inspection.certificateNumber || 'Certificate No.',
    dateLabel: inspection.testDate || 'Date of test',
    dueDateLabel: inspection.nextTestDue || 'Next test due',
    title: inspection.title || 'VEHICLE INSPECTION',
  }
}
