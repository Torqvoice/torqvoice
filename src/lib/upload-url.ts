import { z } from 'zod'

/**
 * The URLs the app hands out for its own uploads, and nothing else.
 *
 * Every stored file URL is later turned into a path on disk and read, copied
 * or unlinked, so what may be stored is exactly the shape the upload routes
 * produce: an organisation id, a category folder and one file name. Anything
 * with a slash or a dot pair in the wrong place, another host, or a scheme is
 * refused before it reaches the database.
 */

export const UPLOAD_CATEGORIES = [
  'vehicles',
  'inventory',
  'services',
  'logos',
  'email-logos',
  'email-images',
  'quotes',
  'portal',
  'tire-hotel',
] as const

export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number]

const UPLOAD_URL =
  /^\/api\/(?:protected\/)?files\/([A-Za-z0-9_-]{1,64})\/([a-z-]{1,32})\/([A-Za-z0-9][A-Za-z0-9._-]{0,200})$/

/**
 * The shape files had before uploads were served per organisation: a
 * category folder under public/uploads and one file name. Nothing left on
 * disk is written this way any more, but records that still carry one are
 * sent back whole when their owner edits them, so the shape stays storable.
 * There is no organisation in it to check; the path resolver contains it.
 */
const LEGACY_UPLOAD_URL = /^\/uploads\/([a-z-]{1,32})\/([A-Za-z0-9][A-Za-z0-9._-]{0,200})$/

export interface UploadUrlParts {
  organizationId: string
  category: string
  file: string
}

/** The parts of one of our upload URLs, or null for anything else. */
export function parseUploadUrl(value: string | null | undefined): UploadUrlParts | null {
  const match = value ? UPLOAD_URL.exec(value) : null
  if (!match) return null
  const [, organizationId, category, file] = match
  if (file.includes('..') || !(UPLOAD_CATEGORIES as readonly string[]).includes(category)) {
    return null
  }
  return { organizationId, category, file }
}

/** Whether a value is a file of ours in any of the shapes we have stored. */
export function isStoredUploadUrl(value: string | null | undefined): boolean {
  if (!value) return false
  if (parseUploadUrl(value)) return true
  const legacy = LEGACY_UPLOAD_URL.exec(value)
  return !!legacy && !legacy[2].includes('..')
}

/**
 * Whether a value is a picture on another site: the address a supplier's
 * catalogue gives for a part. It never reaches the disk, only an <img>, so
 * the only thing to refuse is a scheme that could run something.
 */
export function isRemoteImageUrl(value: string | null | undefined): boolean {
  if (!value || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Whether a stored URL names one of this organisation's own uploads. */
export function isOwnUploadUrl(value: string | null | undefined, organizationId: string): boolean {
  return parseUploadUrl(value)?.organizationId === organizationId
}

/**
 * Refuses a URL that is not one of this organisation's uploads. Empty means
 * "no file" and passes, since that is how a cleared image is expressed.
 */
export function assertOwnUploadUrl(
  value: string | null | undefined,
  organizationId: string,
  what = 'file'
): void {
  if (!value) return
  if (!isOwnUploadUrl(value, organizationId)) {
    throw new Error(`The ${what} is not an upload of this workshop`)
  }
}

/** A zod string that must be one of our upload URLs. */
export const uploadUrlSchema = z
  .string()
  .max(300)
  .refine((value) => isStoredUploadUrl(value), 'Not an upload of this workshop')

/** The same, but an empty string is allowed for "no file". */
export const optionalUploadUrlSchema = z
  .string()
  .max(300)
  .refine((value) => value === '' || isStoredUploadUrl(value), 'Not an upload of this workshop')

/**
 * A picture that may be one of our uploads or live on another site. Part
 * images are the case: "fetch from supplier" keeps the catalogue's own
 * address rather than copying the file, and the record is saved with it.
 */
export const imageUrlSchema = z
  .string()
  .max(2000)
  .refine(
    (value) => isStoredUploadUrl(value) || isRemoteImageUrl(value),
    'Not an upload of this workshop or a web address'
  )

const UPLOAD_PREFIXES = ['/api/protected/files/', '/api/files/']

/**
 * Walks a parsed input and refuses any string that names an upload of
 * another organisation. The shape checks above say what a URL must look
 * like; this says whose it must be, and it runs after every parse that
 * stores one, so a copied URL can never point a record at a stranger's file.
 */
export function assertOwnUploads(value: unknown, organizationId: string): void {
  if (typeof value === 'string') {
    if (UPLOAD_PREFIXES.some((prefix) => value.startsWith(prefix))) {
      const normalised = value.replace('/api/files/', '/api/protected/files/')
      if (!isOwnUploadUrl(normalised, organizationId)) {
        throw new Error('A file in this request is not an upload of this workshop')
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) assertOwnUploads(item, organizationId)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertOwnUploads(item, organizationId)
    }
  }
}

/** The extension a stored file gets, from its validated MIME type, never from its name. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export function extensionForType(mimeType: string, fallback = 'bin'): string {
  return EXTENSION_BY_TYPE[mimeType.toLowerCase()] ?? fallback
}

/**
 * Headers for serving a stored SVG. The file is offered as a download inside
 * a sandbox, never rendered in the app's origin, so a script inside it has
 * nowhere to run.
 */
export function svgDownloadHeaders(cacheControl: string): Record<string, string> {
  return {
    'Content-Type': 'image/svg+xml',
    'Content-Disposition': 'attachment',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cacheControl,
  }
}
