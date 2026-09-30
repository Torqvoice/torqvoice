import 'server-only'
import { db } from '@/lib/db'

/**
 * The inspection whose certificate goes with an invoice or a quote: the one
 * linked to it, once it is finished. An unfinished inspection has no
 * certificate to give; it would say what has not been checked yet.
 */
export async function linkedCertificateInspectionId(
  organizationId: string,
  inspectionId: string | null | undefined
): Promise<string | null> {
  if (!inspectionId) return null
  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, organizationId, status: 'completed' },
    select: { id: true },
  })
  return inspection?.id ?? null
}
