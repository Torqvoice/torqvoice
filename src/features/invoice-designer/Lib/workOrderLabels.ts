/**
 * The words a work order prints, as the document builder expects them.
 *
 * The builder is the invoice's, so its title strip asks for
 * `invoiceNumberLabel` and its customer panel for `billTo`. A work order
 * answers those with its own words, the way the certificate does, and adds
 * the vocabulary of its own sections: the job details, the concerns, the
 * checklist, the customer's signature line. Used by the print path and the
 * designer's preview alike, so both say the same thing.
 */

type Labels = Record<string, string>

/** The work order's wording over the invoice's, and the strip's captions renamed. */
export function withWorkOrderLabels(base: Labels, workOrder: Labels | undefined): Labels {
  const wo = workOrder ?? {}
  return {
    ...base,
    ...wo,
    title: wo.title || 'WORK ORDER',
    invoiceNumberLabel: wo.orderNumberLabel || 'Work order No.',
    billTo: wo.customer || base.billTo || 'Customer',
  }
}

/** The labels a designed work order prints, from the whole `pdf.json`. */
export function workOrderLabels(
  pdfMessages: Record<string, Record<string, string> | undefined>
): Labels {
  return withWorkOrderLabels(
    { ...(pdfMessages.invoice ?? {}), ...(pdfMessages.common ?? {}) },
    pdfMessages.workOrder
  )
}
