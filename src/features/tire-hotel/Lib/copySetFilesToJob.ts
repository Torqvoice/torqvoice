import type { Prisma } from '@/generated/prisma/client'

export interface SetFile {
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  description: string | null
}

/**
 * Copies the set's photos onto a job, so the invoice shows what the technician
 * saw.
 *
 * Photos only. A PDF stored with a set (a storage agreement, an old invoice)
 * would be appended to the job's invoice page for page, which is never what
 * billing a tire swap means.
 *
 * Pointing at the same files rather than duplicating the bytes: a photo of a
 * kerbed rim is one photo, and copying it would double the disk for every
 * season a set is billed. Removing it from the set later leaves the invoice
 * intact, which is the right way round for a document a customer may hold.
 */
export async function copySetFilesToJob(
  tx: Prisma.TransactionClient,
  serviceRecordId: string,
  files: SetFile[]
) {
  const photos = files.filter((file) => file.fileType.startsWith('image/'))
  if (photos.length === 0) return
  await tx.serviceAttachment.createMany({
    data: photos.map((file) => ({
      serviceRecordId,
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      fileType: file.fileType,
      fileSize: file.fileSize,
      description: file.description,
      category: 'tire_hotel',
      includeInInvoice: true,
    })),
  })
}
