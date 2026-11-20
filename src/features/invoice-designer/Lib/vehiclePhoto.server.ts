import 'server-only'

import { readFile, stat } from 'node:fs/promises'
import { db } from '@/lib/db'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { isOwnUploadUrl } from '@/lib/upload-url'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { VehiclePhotoPrint } from '../Spec/buildSpec'
import { linearFor, type PhotoTone } from './photoContrast'
import { type PhotoTemplate, vehicleBlockTone, vehiclePhotoStyleOf } from './vehiclePhoto'

/**
 * The vehicle's photo, made ready for a document.
 *
 * A photo is never worth a document: every read and every step of the image
 * pipeline has a time limit, and a vehicle whose file is missing, too big,
 * not an image or slow to decode prints exactly as if the design had the
 * option off. Nothing here throws.
 *
 * The photo always travels as a data URI. A share page or the portal never
 * receives an address to the file, only the picture, and only when the
 * design prints it.
 */

/** How long any one step may take before the document goes without the photo. */
export const PHOTO_TIMEOUT_MS = 3000
/** A file larger than this is not read at all. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
/** Nor is one whose pixels would take more memory than a document deserves. */
const MAX_INPUT_PIXELS = 60_000_000

/** The sharp copy printed beside the lines, and the one an issued invoice keeps. */
const SOURCE_WIDTH = 600
const SOURCE_QUALITY = 80
/** The washed-out copy behind the block. */
const FADED_WIDTH = 900
const FADED_QUALITY = 72
const FADED_BLUR = 6
const FADED_SATURATION = 0.45

/** Processed photos kept in memory, so a redraw does not decode again. */
const CACHE_LIMIT = 50

type SharpFactory = typeof import('sharp')['default']
let cachedSharp: SharpFactory | null | undefined

/**
 * sharp is native and can be missing or broken on a machine; loaded lazily
 * and behind a catch, so that costs the photo and never the document.
 */
async function getSharp(): Promise<SharpFactory | null> {
  if (cachedSharp !== undefined) return cachedSharp
  try {
    const loaded = (await import('sharp')).default
    loaded.concurrency(1)
    cachedSharp = loaded
  } catch (error) {
    console.error('[Vehicle photo] sharp is unavailable; documents print without it:', error)
    cachedSharp = null
  }
  return cachedSharp
}

/** The promise's value, or null once the time is up or it fails. */
export async function withTimeout<T>(work: Promise<T>, ms = PHOTO_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([work.catch(() => null), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** A small least-recently-used cache. */
class Lru<V> {
  private map = new Map<string, V>()
  constructor(private limit: number) {}
  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }
  set(key: string, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }
  clear(): void {
    this.map.clear()
  }
  get size(): number {
    return this.map.size
  }
}

/** The photo resized for print: a small JPEG and its proportions. */
export interface PhotoSource {
  /** What identifies these bytes in the cache: the file and its version, or a snapshot. */
  key: string
  bytes: Buffer
  width: number
  height: number
}

const sources = new Lru<PhotoSource>(CACHE_LIMIT)
const prints = new Lru<string>(CACHE_LIMIT)

/** For the tests: forget every processed photo. */
export function clearVehiclePhotoCache(): void {
  sources.clear()
  prints.clear()
}

/** For the tests: how many processed photos are held. */
export function vehiclePhotoCacheSize(): number {
  return sources.size + prints.size
}

/** The bytes as the sharp, small JPEG every print starts from. */
async function toSource(input: Buffer, key: string): Promise<PhotoSource | null> {
  const sharp = await getSharp()
  if (!sharp) return null
  const out = await withTimeout(
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate() // the EXIF orientation, before it is stripped
      .resize({ width: SOURCE_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: SOURCE_QUALITY })
      .toBuffer({ resolveWithObject: true })
  )
  if (!out?.info.width || !out.info.height) return null
  return { key, bytes: out.data, width: out.info.width, height: out.info.height }
}

/**
 * The vehicle's uploaded photo, resized. Null for an address that is not
 * one of this workshop's uploads, a file that is missing, too large or not
 * an image, and anything that takes too long.
 */
export async function loadVehiclePhotoSource(
  organizationId: string,
  fileUrl: string | null | undefined
): Promise<PhotoSource | null> {
  if (!fileUrl) return null
  const url = fileUrl.replace('/api/files/', '/api/protected/files/')
  if (!isOwnUploadUrl(url, organizationId)) return null
  try {
    const path = resolveUploadPath(url)
    const info = await withTimeout(stat(path))
    if (!info?.isFile() || info.size === 0 || info.size > MAX_PHOTO_BYTES) return null
    const key = `file:${path}:${info.mtimeMs}:${info.size}`
    const cached = sources.get(key)
    if (cached) return cached
    const bytes = await withTimeout(readFile(path))
    if (!bytes) return null
    const source = await toSource(bytes, key)
    if (source) sources.set(key, source)
    return source
  } catch {
    return null
  }
}

/** A photo kept with an issued invoice, read back. Null when it cannot be. */
export async function photoSourceFromSnapshot(snapshot: {
  id: string
  data: Uint8Array
}): Promise<PhotoSource | null> {
  const key = `snapshot:${snapshot.id}`
  const cached = sources.get(key)
  if (cached) return cached
  try {
    const bytes = Buffer.from(snapshot.data)
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null
    // Kept already resized and turned upright: the frozen bytes print as
    // they are, and only their proportions are read.
    const sharp = await getSharp()
    if (!sharp) return null
    const meta = await withTimeout(
      sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata()
    )
    if (!meta?.width || !meta.height || meta.format !== 'jpeg') return null
    const source = { key, bytes, width: meta.width, height: meta.height }
    sources.set(key, source)
    return source
  } catch {
    return null
  }
}

/** The source as a data URI, the form an issued invoice keeps it in. */
export function photoSourceDataUri(source: PhotoSource): string {
  return `data:image/jpeg;base64,${source.bytes.toString('base64')}`
}

/** The washed-out copy for behind the block, as a data URI. */
async function fadedDataUri(source: PhotoSource, tone: PhotoTone): Promise<string | null> {
  const key = `${source.key}|faded|${tone.mode}:${tone.value}|${FADED_WIDTH}`
  const cached = prints.get(key)
  if (cached) return cached
  const sharp = await getSharp()
  if (!sharp) return null
  const { a, b } = linearFor(tone)
  const out = await withTimeout(
    sharp(source.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: FADED_WIDTH })
      .blur(FADED_BLUR)
      .modulate({ saturation: FADED_SATURATION })
      .removeAlpha()
      // Every channel into floor..255 (or 0..ceiling): whatever the picture,
      // the block's inks keep their contrast on every pixel of it.
      .linear([a, a, a], [b, b, b])
      // Full colour resolution: subsampled chroma rings past the floor.
      .jpeg({ quality: FADED_QUALITY, chromaSubsampling: '4:4:4' })
      .toBuffer()
  )
  if (!out) return null
  const uri = `data:image/jpeg;base64,${out.toString('base64')}`
  prints.set(key, uri)
  return uri
}

/**
 * The photo in the form the design prints it: the sharp copy beside the
 * lines, or the faded one behind them. Undefined when it cannot be made.
 */
export async function vehiclePhotoPrint(
  source: PhotoSource | null,
  style: 'beside' | 'faded' | null,
  tone: () => PhotoTone
): Promise<VehiclePhotoPrint | undefined> {
  if (!source || !style) return undefined
  try {
    if (style === 'beside') {
      return {
        beside: { src: photoSourceDataUri(source), aspect: source.width / source.height },
      }
    }
    const faded = await fadedDataUri(source, tone())
    return faded ? { faded } : undefined
  } catch {
    return undefined
  }
}

/**
 * Everything a live document needs: the photo as this design prints it, and
 * the source an issue would keep. Nothing is read for a design that does not
 * print the photo or a document without a vehicle.
 */
export async function vehiclePhotoForDesign(
  organizationId: string,
  vehicleId: string | null | undefined,
  layout: Partial<InvoiceLayoutConfig> | null | undefined,
  template: PhotoTemplate | null | undefined
): Promise<{ print?: VehiclePhotoPrint; source?: PhotoSource }> {
  try {
    const style = vehiclePhotoStyleOf(layout)
    if (!style || !vehicleId || !layout) return {}
    const vehicle = await withTimeout(
      db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { imageUrl: true },
      })
    )
    const source = await loadVehiclePhotoSource(organizationId, vehicle?.imageUrl)
    if (!source) return {}
    const print = await vehiclePhotoPrint(source, style, () => vehicleBlockTone(layout, template))
    return print ? { print, source } : {}
  } catch {
    return {}
  }
}

/** The photo for a live document, as the design prints it. */
export async function vehiclePhotoForDocument(
  organizationId: string,
  vehicleId: string | null | undefined,
  layout: Partial<InvoiceLayoutConfig> | null | undefined,
  template: PhotoTemplate | null | undefined
): Promise<VehiclePhotoPrint | undefined> {
  return (await vehiclePhotoForDesign(organizationId, vehicleId, layout, template)).print
}
