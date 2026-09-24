import 'server-only'

import { db } from '@/lib/db'
import { isDesignerLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  type DesignSource,
  designSourceFromSettings,
  designSourceFromSnapshot,
} from '@/features/invoice-designer/Lib/designSource'
import { certificateLabels } from '../Lib/certificateLabels'
import { inspectionPrintLabels } from '../Lib/inspectionLabels'

/**
 * Which design an inspection's certificate is drawn from, and in whose words.
 *
 * Shared by the PDF, the customer's link and the completion that freezes the
 * design, so the three cannot disagree about what a certificate looks like.
 * Kept apart from the PDF builder so a page can resolve the design without
 * pulling the PDF renderer into its bundle.
 */

/** The design this inspection prints from, or null when it has none. */
export async function certificateDesignSource(
  organizationId: string,
  inspection: { designSnapshotId: string | null },
  settingsMap: Record<string, string>
): Promise<DesignSource | null> {
  if (inspection.designSnapshotId) {
    const snapshot = await db.documentDesignSnapshot.findFirst({
      where: { id: inspection.designSnapshotId, organizationId },
      select: { layout: true, template: true },
    })
    const frozen = snapshot ? designSourceFromSnapshot(snapshot.layout, snapshot.template) : null
    if (frozen) return frozen
  }
  return liveCertificateDesign(settingsMap)
}

/** The live certificate design, for freezing when an inspection is completed. */
export function liveCertificateDesign(settingsMap: Record<string, string>): DesignSource | null {
  const live = designSourceFromSettings(settingsMap, 'certificate')
  return isDesignerLayout(live.layout) ? live : null
}

export async function loadPdfMessages(locale: string) {
  try {
    return (await import(`../../../../messages/${locale}/pdf.json`)).default
  } catch {
    return (await import(`../../../../messages/en/pdf.json`)).default
  }
}

/** The translated strings a designed certificate prints, for one locale. */
export async function loadCertificateLabels(
  locale: string,
  settingsMap: Record<string, string>
): Promise<Record<string, string>> {
  const pdfMessages = await loadPdfMessages(locale)
  return certificateLabels(pdfMessages, inspectionPrintLabels(pdfMessages, settingsMap))
}
