import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { orgUploadDir } from '@/lib/upload-root'
import { extensionForType } from '@/lib/upload-url'
import { cleanAttachmentName, type IncomingFile, selectAttachments } from './inboundMail'

/** The upload folder inbound mail attachments are written to. */
export const EMAIL_UPLOAD_FOLDER = 'email'

export interface StoredEmailAttachment {
  fileName: string
  contentType: string
  size: number
  url: string
}

export interface AttachmentToStore extends IncomingFile {
  content: Buffer
}

/**
 * Writes the kept files of a mail into the workshop's uploads, the way the
 * upload route does: a random name under the workshop's own folder, served
 * back through the protected file route to members of that workshop only.
 * The rows pointing at them are written by the caller; a file whose row
 * never gets written is an orphan the nightly sweep trashes.
 */
export async function storeEmailAttachments(
  organizationId: string,
  files: readonly AttachmentToStore[]
): Promise<StoredEmailAttachment[]> {
  const kept = selectAttachments(files)
  if (kept.length === 0) return []

  const dir = orgUploadDir(organizationId, EMAIL_UPLOAD_FOLDER)
  await mkdir(dir, { recursive: true })

  const stored: StoredEmailAttachment[] = []
  for (const index of kept) {
    const file = files[index]
    const contentType = file.contentType.toLowerCase()
    const extension = extensionForType(contentType)
    const name = `${randomUUID()}.${extension}`
    await writeFile(path.join(dir, name), file.content)
    stored.push({
      fileName: cleanAttachmentName(file.filename, extension),
      contentType,
      size: file.content.length,
      url: `/api/protected/files/${organizationId}/${EMAIL_UPLOAD_FOLDER}/${name}`,
    })
  }
  return stored
}
