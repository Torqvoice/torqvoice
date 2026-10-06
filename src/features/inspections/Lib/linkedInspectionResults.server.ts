import 'server-only'
import { db } from '@/lib/db'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import { isDefect } from './conditions'
import { loadInspectionPhotos } from './inspectionPhotos'
import {
  type InspectionResultItem,
  type InspectionResults,
  inspectionResultsWanted,
} from './inspectionResults'

/** The inspection linked to a job, as the work order's result sections read it. */
export type LinkedInspectionResults = InspectionResults

/**
 * The checks of the inspection linked to a job, for the work order's sheet.
 *
 * Unlike the certificate that goes with an invoice, this does not wait for the
 * inspection to be finished: a work order is the job as it stands, so it says
 * what has been graded so far. The inspection has to be the workshop's own
 * and on the job's own vehicle; anything else is no inspection at all.
 */
export async function loadLinkedInspectionResults(
  organizationId: string,
  vehicleId: string | null | undefined,
  inspectionId: string | null | undefined,
  options: { photos: boolean }
): Promise<LinkedInspectionResults | null> {
  if (!inspectionId || !vehicleId) return null
  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, organizationId, vehicleId },
    select: {
      severityScale: true,
      country: true,
      template: { select: { severityScale: true, country: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          section: true,
          sectionCode: true,
          code: true,
          condition: true,
          notes: true,
          sortOrder: true,
          measuredValue: true,
          unit: true,
          textValue: true,
          inputType: true,
          imageUrls: true,
        },
      },
    },
  })
  if (!inspection || inspection.items.length === 0) return null

  return {
    severityScale:
      (inspection.severityScale ?? inspection.template.severityScale) === 'basic' ? 'basic' : 'eu',
    country: inspection.country ?? inspection.template.country ?? null,
    items: inspection.items,
    itemPhotos: options.photos ? await loadDefectPhotos(inspection.items) : undefined,
  }
}

/**
 * The photographs of the checks that were not OK, sized for the page. Only
 * those: the defects are the one place a borrowed result section draws a
 * photo. A file that has gone is left out, and a failure costs the photos
 * rather than the document they would have been on.
 */
export async function loadDefectPhotos(
  items: InspectionResultItem[]
): Promise<InspectionResults['itemPhotos']> {
  const defects = items
    .filter((item) => isDefect(item.condition) && (item.imageUrls?.length ?? 0) > 0)
    .map((item) => ({
      id: item.id,
      condition: item.condition,
      sortOrder: item.sortOrder,
      imageUrls: item.imageUrls ?? [],
    }))
  if (defects.length === 0) return undefined
  try {
    return (await loadInspectionPhotos(defects)).photos
  } catch (error) {
    console.error('[Inspection results] Photo embedding failed, printing without photos:', error)
    return undefined
  }
}

/**
 * The inspection behind a document, read only for a layout that prints its
 * results: the one linked to a job for a work order or a draft invoice, the
 * one a quote was raised from for a quote. Every other document costs no
 * query more than it did.
 */
export async function inspectionResultsFor(
  organizationId: string,
  source: { vehicleId: string | null | undefined; inspectionId: string | null | undefined },
  layout: Pick<InvoiceLayoutConfig, 'sections'>,
  options: { photos?: boolean } = {}
): Promise<InspectionResults | null> {
  const { wanted, photos } = inspectionResultsWanted(layout)
  if (!wanted) return null
  return loadLinkedInspectionResults(organizationId, source.vehicleId, source.inspectionId, {
    photos: photos && options.photos !== false,
  })
}
