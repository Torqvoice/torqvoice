/**
 * Turns a photographed document into a JPEG data URI for the vision model.
 *
 * Kept separate from `compressImage`: that one is tuned for photos that end up
 * in PDFs and may hand back the original file untouched. A vision call needs a
 * format the API accepts every time, and registration papers carry small print,
 * so this keeps a longer edge and a higher quality than a plain photo would need.
 */

/**
 * A server action body has to stay under a megabyte, and base64 adds a third on
 * top of the JPEG. Anything larger gets re-encoded smaller rather than failing
 * at the request boundary.
 */
const MAX_DATA_URI_BYTES = 800_000

function encode(img: HTMLImageElement, maxEdge: number, quality: number): string {
  let { naturalWidth: width, naturalHeight: height } = img
  if (width > maxEdge || height > maxEdge) {
    const scale = maxEdge / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')

  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

export function documentToDataUri(file: File, maxEdge = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        // Small print is worth a large image, so give up resolution only as far
        // as the request limit demands.
        const attempts: Array<[number, number]> = [
          [maxEdge, quality],
          [1280, 0.75],
          [1024, 0.7],
        ]
        let encoded = ''
        for (const [edge, q] of attempts) {
          encoded = encode(img, edge, q)
          if (encoded.length <= MAX_DATA_URI_BYTES) break
        }
        resolve(encoded)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not read image'))
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image'))
    }

    img.src = objectUrl
  })
}
