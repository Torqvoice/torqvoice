import { isPrintableImage } from '@/features/invoices/Lib/printableImage'

/**
 * What a signature image may be: a PNG or JPEG the PDF renderer can draw, and
 * small. The settings card flattens whatever is drawn or picked to a PNG no
 * wider than a signature line needs, so anything near the limit was not made
 * by the app.
 */
export const SIGNATURE_MAX_BYTES = 300 * 1024

const DATA_URI = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/

export interface SignatureImage {
  mimeType: 'image/png' | 'image/jpeg'
  bytes: Buffer
}

/** The image a data URI carries, or null when it is not one a sheet can print. */
export function parseSignatureDataUri(value: unknown): SignatureImage | null {
  if (typeof value !== 'string') return null
  const match = DATA_URI.exec(value.trim())
  if (!match) return null
  const mimeType = match[1] as SignatureImage['mimeType']
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length === 0 || bytes.length > SIGNATURE_MAX_BYTES) return null
  if (!isPrintableImage(bytes, mimeType)) return null
  return { mimeType, bytes }
}
