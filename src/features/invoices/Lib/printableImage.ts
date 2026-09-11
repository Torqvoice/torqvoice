import { crc32 } from 'node:zlib'

/**
 * Whether an image can be drawn into a PDF.
 *
 * The renderer takes PNG and JPEG and nothing else, and it decodes them
 * inside its own stream: a file that says PNG and is not one throws where
 * nothing can catch it, the request never answers, and the process logs an
 * uncaught `Z_DATA_ERROR`. One truncated photograph on a job — a phone that
 * lost signal mid-upload — was enough to make that job's invoice
 * unobtainable, in the preview as well as the download.
 *
 * So the bytes are checked before they are handed over. Anything that fails
 * is still listed on the invoice by name, exactly as an unreadable file
 * already was; it is simply not drawn.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * A PNG whose structure holds together: the signature, then chunks whose
 * lengths stay inside the file and whose checksums match, starting at IHDR
 * and ending at IEND. Checksums rather than a full inflate because a
 * truncated or damaged file fails them just the same, at a fraction of the
 * cost on a photograph.
 */
function isIntactPng(bytes: Buffer): boolean {
  if (bytes.length < PNG_SIGNATURE.length + 12) return false
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false

  let offset = 8
  let first = true
  let sawEnd = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const end = offset + 12 + length
    if (length > bytes.length || end > bytes.length) return false

    const type = bytes.subarray(offset + 4, offset + 8).toString('latin1')
    if (first && type !== 'IHDR') return false
    first = false

    const declared = bytes.readUInt32BE(offset + 8 + length)
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== declared) return false

    if (type === 'IEND') {
      sawEnd = true
      break
    }
    offset = end
  }
  return sawEnd
}

/** A JPEG that starts and finishes where a JPEG should. */
function isIntactJpeg(bytes: Buffer): boolean {
  if (bytes.length < 4) return false
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
  // The end marker is the last thing in the file, give or take padding some
  // cameras leave behind.
  const tail = bytes.subarray(Math.max(0, bytes.length - 32))
  for (let i = 0; i + 1 < tail.length; i++) {
    if (tail[i] === 0xff && tail[i + 1] === 0xd9) return true
  }
  return false
}

/**
 * Whether this file can be drawn into the sheet. WEBP is deliberately out:
 * uploads accept it, the renderer cannot read it, and an image it cannot read
 * is the failure above.
 */
export function isPrintableImage(bytes: Buffer, fileType: string): boolean {
  const type = fileType.toLowerCase()
  if (type === 'image/png') return isIntactPng(bytes)
  if (type === 'image/jpeg' || type === 'image/jpg') return isIntactJpeg(bytes)
  return false
}
