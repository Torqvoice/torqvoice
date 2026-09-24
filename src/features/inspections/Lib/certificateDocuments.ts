import 'server-only'

import { readFile } from 'fs/promises'
import { PDFDocument } from 'pdf-lib'
import { resolveUploadPath } from '@/lib/resolve-upload-path'

interface DocumentSource {
  fileName: string
  fileType: string
  fileUrl: string
  includeInReport: boolean
}

/** The documents on the inspection that the workshop chose to show, PDFs only. */
export function certificateDocuments(attachments: DocumentSource[]): DocumentSource[] {
  return attachments.filter((file) => file.includeInReport && file.fileType === 'application/pdf')
}

/**
 * Appends the inspection's shown PDF documents to the certificate, as the
 * invoice appends its attached reports: the regulator's own form, filled in
 * and signed, travels with the certificate that summarises it.
 *
 * A document that cannot be read or is not a PDF after all is skipped; the
 * certificate itself is never lost over an attachment.
 */
export async function appendCertificateDocuments(
  certificate: Buffer,
  documents: DocumentSource[]
): Promise<ArrayBuffer> {
  const slice = (bytes: Uint8Array) =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  if (documents.length === 0) return slice(certificate)

  const merged = await PDFDocument.load(certificate)
  for (const document of documents) {
    try {
      const attached = await PDFDocument.load(await readFile(resolveUploadPath(document.fileUrl)))
      const pages = await merged.copyPages(attached, attached.getPageIndices())
      for (const page of pages) merged.addPage(page)
    } catch (error) {
      console.error(`[Inspection PDF] Could not append ${document.fileName}:`, error)
    }
  }
  return slice(await merged.save())
}
