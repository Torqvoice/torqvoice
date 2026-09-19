import 'server-only'

import sharp from 'sharp'

/**
 * A picture somebody uploaded, made safe to keep and to serve.
 *
 * The browser's declared type and the file's own name are both the
 * uploader's word for what the bytes are. Decoding through sharp is the
 * check: it refuses anything that is not a raster image, so an SVG with a
 * script in it, or a PNG-named text file, never reaches the disk. The
 * output is re-encoded, so the stored file contains only pixels, and the
 * extension comes from the decoded format rather than the name.
 */

/** More pixels than this and the decode alone would eat a gigabyte. */
const MAX_INPUT_PIXELS = 40_000_000

export interface CleanImage {
  data: Buffer
  ext: 'png' | 'jpg' | 'webp'
  width: number
  height: number
}

export interface CleanImageOptions {
  /** Longest side the stored picture may have; larger inputs are fitted. */
  maxSide: number
}

export async function cleanImage(source: Buffer, options: CleanImageOptions): Promise<CleanImage> {
  const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate()
  const meta = await image.metadata()
  if (!meta.width || !meta.height || !meta.format || meta.format === 'svg') {
    throw new Error('Not an image we can read')
  }

  const fitted = image.resize({
    width: options.maxSide,
    height: options.maxSide,
    fit: 'inside',
    withoutEnlargement: true,
  })

  // Transparency survives as PNG; photographs are smaller as JPEG; WebP
  // stays WebP because that is what the workshop chose to give us.
  if (meta.format === 'webp') {
    const out = await fitted.webp({ quality: 85 }).toBuffer({ resolveWithObject: true })
    return { data: out.data, ext: 'webp', width: out.info.width, height: out.info.height }
  }
  if (meta.hasAlpha || meta.format === 'png' || meta.format === 'gif') {
    const out = await fitted.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    return { data: out.data, ext: 'png', width: out.info.width, height: out.info.height }
  }
  const out = await fitted
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { data: out.data, ext: 'jpg', width: out.info.width, height: out.info.height }
}

export interface CompressedPhoto {
  data: Buffer
  width: number
  height: number
}

/**
 * A photograph as the workshop keeps it: decoded (which refuses anything that
 * is not a raster image), turned upright, fitted inside `maxSide` and saved as
 * a JPEG, whatever arrived. The same size the browser's own compression aims
 * for (lib/compress-image.ts, 1200px), done again here because a client can
 * skip its half: this is what keeps a phone-sized original, or a crafted file,
 * off the disk at full size.
 */
export async function compressPhoto(source: Buffer, maxSide = 1200): Promise<CompressedPhoto> {
  const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate()
  const meta = await image.metadata()
  if (!meta.width || !meta.height || !meta.format || meta.format === 'svg') {
    throw new Error('Not an image we can read')
  }
  const out = await image
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    // A photo has no use for transparency; a PNG screenshot gets a white page.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { data: out.data, width: out.info.width, height: out.info.height }
}
