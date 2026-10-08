/**
 * What an uploaded video really is, read from its bytes.
 *
 * The MIME type on an upload is whatever the client says it is. A text file
 * labelled video/mp4 that is really an HLS playlist or an ffmpeg concat
 * script makes ffmpeg open the files it names, local ones included, and mux
 * them into the output the uploader then downloads. So a video is only ever
 * treated as one when its first bytes are the container it claims to be,
 * and ffmpeg is then told which demuxer to use instead of guessing.
 */

/** The containers the upload routes accept, as found in the bytes. */
export type VideoContainer = 'mp4' | 'webm'

/** The video MIME types an upload may declare, and the container each must hold. */
const DECLARED_CONTAINER: Record<string, VideoContainer> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mp4',
  'video/webm': 'webm',
}

/** How many leading bytes the sniff needs. */
export const VIDEO_SNIFF_BYTES = 12

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3]
const FTYP = [0x66, 0x74, 0x79, 0x70] // "ftyp"

function matchesAt(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false
  return magic.every((byte, i) => bytes[offset + i] === byte)
}

/**
 * The container the bytes start with, or null for anything else. MP4 and
 * QuickTime both open with a box whose type, at byte 4, is "ftyp"; WebM and
 * Matroska open with the EBML header.
 */
export function sniffVideoContainer(bytes: Uint8Array): VideoContainer | null {
  if (bytes.length < VIDEO_SNIFF_BYTES) return null
  if (matchesAt(bytes, 4, FTYP)) return 'mp4'
  if (matchesAt(bytes, 0, EBML_MAGIC)) return 'webm'
  return null
}

/** Whether the client declared the upload to be a video. */
export function isDeclaredVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

/**
 * The container of an upload declared as a video, or null when the bytes
 * are not the container that type promises. A WebM labelled video/mp4 is
 * refused too: the routes that keep the bytes as they came name and serve
 * the file by its declared type.
 */
export function sniffDeclaredVideo(mimeType: string, bytes: Uint8Array): VideoContainer | null {
  const expected = DECLARED_CONTAINER[mimeType]
  if (!expected) return null
  return sniffVideoContainer(bytes) === expected ? expected : null
}

/**
 * The ffmpeg demuxer for a sniffed container. ffmpeg matches `-f` against
 * the demuxer's own names, "mov,mp4,m4a,3gp,3g2,mj2" and "matroska,webm".
 */
export function ffmpegInputFormat(container: VideoContainer): 'mov' | 'matroska' {
  return container === 'mp4' ? 'mov' : 'matroska'
}

/** The message for an upload that says it is a video but is not one. */
export const NOT_A_VIDEO_MESSAGE =
  'That file is not a video we can read. Upload an MP4, MOV or WebM file.'
