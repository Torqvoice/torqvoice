import { parseUploadUrl } from '@/lib/upload-url'

/**
 * What a customer may send the workshop from the portal: photos and a short
 * video, with a message in the chat or with a request for a visit.
 *
 * Pure, so the booking form, the chat and the upload route read the same
 * limits: the form says "up to 15 MB" because the route refuses more, and
 * neither can drift from the other. Nothing here touches the disk.
 */

/** The folder every customer upload is stored in (see lib/upload-url.ts). */
export const PORTAL_UPLOAD_FOLDER = 'portal-uploads'

/** What a phone camera or a photo library hands over. */
export const PORTAL_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
/** The three containers a phone or a browser records in. */
export const PORTAL_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

/**
 * A photo straight off a phone camera is 3 to 8 MB; 15 leaves room for the
 * largest. It is saved again as a smaller JPEG whatever arrives.
 */
export const PORTAL_PHOTO_MAX_BYTES = 15 * 1024 * 1024
/**
 * About a minute of a phone's ordinary video: enough to film a noise or a
 * warning light, not a walk round the car. A video is kept as it came, so
 * this is what one costs on the workshop's disk.
 */
export const PORTAL_VIDEO_MAX_BYTES = 100 * 1024 * 1024

/** How many files one request for a visit carries. */
export const PORTAL_REQUEST_MAX_FILES = 6

/** The `accept` of the file picker: exactly what the route takes. */
export const PORTAL_UPLOAD_ACCEPT = [...PORTAL_PHOTO_TYPES, ...PORTAL_VIDEO_TYPES].join(',')

export type PortalUploadKind = 'image' | 'video'

/** Photo, video, or null for a file the portal does not take. */
export function portalUploadKind(mimeType: string): PortalUploadKind | null {
  const type = mimeType.toLowerCase()
  if ((PORTAL_PHOTO_TYPES as readonly string[]).includes(type)) return 'image'
  if ((PORTAL_VIDEO_TYPES as readonly string[]).includes(type)) return 'video'
  return null
}

/** Why a file cannot be sent, or null when it can. Checked again by the route. */
export function portalUploadProblem(file: {
  type: string
  size: number
}): 'type' | 'empty' | 'tooLarge' | null {
  const kind = portalUploadKind(file.type)
  if (!kind) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > (kind === 'video' ? PORTAL_VIDEO_MAX_BYTES : PORTAL_PHOTO_MAX_BYTES)) {
    return 'tooLarge'
  }
  return null
}

/** Megabytes as a whole number, for "up to 15 MB". */
export const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024))

/**
 * Whether a url is a customer upload of this workshop: the exact shape the
 * upload route answers with, in this workshop's `portal-uploads` folder. A
 * request or a message that names anything else is refused, so a customer can
 * never point a row at another workshop's file or at the workshop's own.
 */
export function isPortalUploadUrl(url: unknown, organizationId: string): url is string {
  if (typeof url !== 'string') return false
  const parts = parseUploadUrl(url)
  return (
    !!parts && parts.organizationId === organizationId && parts.category === PORTAL_UPLOAD_FOLDER
  )
}
