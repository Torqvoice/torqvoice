import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { CertificateData } from '@/features/invoice-designer/Spec/certificateData'
import { type CertificatePrintItem, certificateDataFor } from '../Pdf/buildCertificatePrint'

/**
 * An inspection's checks as another document prints them: the work order and
 * the invoice of the job the inspection is linked to, and the quote raised
 * from it. They borrow the certificate's Defects and All Results sections, so
 * this is the inspection reduced to what those two read.
 */

export interface InspectionResultItem extends CertificatePrintItem {
  /** The check's photographs as they are stored; a print embeds them itself. */
  imageUrls?: string[]
}

export interface InspectionResults {
  severityScale: 'eu' | 'basic'
  country: string | null
  /** Every check on the inspection, graded or not. */
  items: InspectionResultItem[]
  /** Photos on each check, keyed by check id, already sized for the page. */
  itemPhotos?: Record<string, { dataUri: string }[]>
}

/**
 * Whether a layout prints either result section, and whether the defects
 * carry their photographs. Asked before the inspection is read, so a design
 * that shows neither costs no query, and one without photographs no decoding.
 */
export function inspectionResultsWanted(layout: Pick<InvoiceLayoutConfig, 'sections'>): {
  wanted: boolean
  photos: boolean
} {
  const shown = (id: string) => layout.sections.find((s) => s.id === id && s.visible)
  const defects = shown('defects')
  return {
    wanted: Boolean(defects || shown('results_table')),
    photos: defects?.fields?.find((f) => f.id === 'defect_photos')?.visible === true,
  }
}

/**
 * The results worded for the certificate's blocks, in the document's own
 * labels, or nothing for a layout that prints neither section and for a
 * document with no inspection behind it. What each section then makes of an
 * inspection with no defects, or with nothing graded yet, is the section's
 * own business.
 */
export function inspectionResultsForPrint(
  layout: Pick<InvoiceLayoutConfig, 'sections'>,
  results: InspectionResults | null | undefined,
  labels: Record<string, string>
): CertificateData | undefined {
  if (!results || results.items.length === 0) return undefined
  if (!inspectionResultsWanted(layout).wanted) return undefined
  return certificateDataFor({
    items: results.items,
    scale: results.severityScale,
    country: results.country,
    labels,
    itemPhotos: results.itemPhotos,
  })
}
