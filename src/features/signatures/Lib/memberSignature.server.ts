import 'server-only'

import { db } from '@/lib/db'
import { assetDataUri } from '@/features/invoice-designer/Lib/designSnapshots'

/**
 * The signature a member of this workshop has saved, as a data URI the
 * renderers take, or undefined when they have none (or are nobody: a job the
 * system opened has no one to sign it).
 */
export async function memberSignatureDataUri(
  organizationId: string,
  userId: string | null | undefined
): Promise<string | undefined> {
  if (!userId) return undefined
  const row = await db.memberSignature.findFirst({
    where: { member: { organizationId, userId } },
    select: { mimeType: true, data: true },
  })
  return row ? assetDataUri(row) : undefined
}

/** Who signs a document: their name, and their saved signature when they have one. */
export async function documentSigner(
  organizationId: string,
  userId: string | null | undefined
): Promise<{ name: string; dataUri?: string }> {
  if (!userId) return { name: '' }
  const [user, dataUri] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    memberSignatureDataUri(organizationId, userId),
  ])
  return { name: user?.name ?? '', dataUri }
}

/**
 * Whose signature an inspection carries: its technician's, when they have an
 * account to have saved one on; with no technician, whoever is completing it,
 * the same person the certificate then names.
 */
export async function inspectorUserId(
  inspection: { technicianId: string | null },
  completingUserId: string
): Promise<string | null> {
  if (!inspection.technicianId) return completingUserId
  const technician = await db.technician.findUnique({
    where: { id: inspection.technicianId },
    select: { userId: true },
  })
  return technician?.userId ?? null
}

/**
 * The signature a certificate prints. A completed inspection prints the one
 * frozen at completion and nothing else, so a redrawn signature never changes
 * a certificate already issued, and one completed before signatures existed
 * stays unsigned. An open one previews its technician's current signature.
 */
export async function certificateSignatureDataUri(
  organizationId: string,
  inspection: {
    completedAt: Date | null
    signatureSnapshotId: string | null
    technicianId: string | null
  }
): Promise<string | undefined> {
  if (inspection.completedAt) {
    if (!inspection.signatureSnapshotId) return undefined
    const snapshot = await db.documentAssetSnapshot.findFirst({
      where: { id: inspection.signatureSnapshotId, organizationId },
      select: { mimeType: true, data: true },
    })
    return snapshot ? assetDataUri(snapshot) : undefined
  }
  if (!inspection.technicianId) return undefined
  const technician = await db.technician.findUnique({
    where: { id: inspection.technicianId },
    select: { userId: true },
  })
  return memberSignatureDataUri(organizationId, technician?.userId)
}
