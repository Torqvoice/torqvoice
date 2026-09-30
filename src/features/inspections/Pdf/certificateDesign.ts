import 'server-only'

import { db } from '@/lib/db'
import {
  DESIGNER_LAYOUT_VERSION,
  isDesignerLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { defaultCertificateDesign } from '../Lib/defaultCertificateDesign'
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

/**
 * The design this inspection prints from, or null for the built-in sheet.
 *
 * A completed inspection prints what it was issued with: its frozen design,
 * or, completed before it had one, the built-in sheet it went out on. An
 * open one prints the workshop's certificate design, or the default one.
 */
export async function certificateDesignSource(
  organizationId: string,
  inspection: { designSnapshotId: string | null; completedAt?: Date | null },
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
  if (inspection.completedAt) {
    const live = designSourceFromSettings(settingsMap, 'certificate')
    return isDesignerLayout(live.layout) ? live : null
  }
  return liveCertificateDesign(settingsMap)
}

/**
 * The live certificate design, for printing an open inspection and freezing
 * when one is completed: the workshop's own, or the default (Regulatory) for a
 * workshop that has not designed one.
 */
export function liveCertificateDesign(settingsMap: Record<string, string>): DesignSource {
  const live = designSourceFromSettings(settingsMap, 'certificate')
  if (isDesignerLayout(live.layout)) return live
  const fallback = defaultCertificateDesign()
  const set = (key: string) => settingsMap[`certificate.${key}`]
  return {
    layout: { ...fallback.layout, version: DESIGNER_LAYOUT_VERSION },
    // The look is the preset's, except what the workshop set for certificates
    // itself (its logo always stays).
    template: {
      ...live.template,
      primaryColor: set('primaryColor') || fallback.template.primaryColor,
      headerStyle: set('headerStyle') || fallback.template.headerStyle,
      fontFamily: set('fontFamily') || fallback.template.fontFamily,
      textColor: set('textColor') || fallback.template.textColor || '',
    },
  }
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
