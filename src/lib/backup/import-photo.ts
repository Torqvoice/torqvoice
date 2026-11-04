import 'server-only'

import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { compressPhoto } from '@/lib/image-upload.server'

/**
 * A file an importer brings over from another system, made the
 * size the app's own upload paths would have made it.
 *
 * Other systems hand their attachments over as the phone took them, several
 * MB a photo, and the browser-side compression every upload form runs never
 * sees them. A workshop's first platform restore point was mostly those
 * files. So a photo is fitted to IMPORTED_PHOTO_SIDE and saved as a JPEG,
 * under a name that says so; anything else, a PDF, a document, an image
 * with several pages or frames, or an image sharp cannot read, is stored as
 * it came.
 */

/** Longest side of an imported photo; a little above the forms' 1200 so a document photo stays legible. */
export const IMPORTED_PHOTO_SIDE = 1600

const PHOTO_NAME = /\.(jpe?g|png|webp|gif|heic|heif|avif|tiff?)$/i

export interface ImportedFile {
  data: Buffer
  /** The name to store and show, with the extension the bytes now have. */
  name: string
  /** The MIME type of `data`. */
  type: string
  /** Whether the bytes were re-encoded. */
  compressed: boolean
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
    txt: 'text/plain',
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}

/** Whether the name is one an importer treats as a photo. */
export function isPhotoName(name: string): boolean {
  return PHOTO_NAME.test(name)
}

export async function prepareImportedFile(name: string, data: Buffer): Promise<ImportedFile> {
  if (!isPhotoName(name)) return { data, name, type: mimeFor(name), compressed: false }
  try {
    // A JPEG holds one page, so a scanned multi-page TIFF or an animated
    // GIF or WebP would lose everything after the first.
    const { pages } = await sharp(data).metadata()
    if ((pages ?? 1) > 1) return { data, name, type: mimeFor(name), compressed: false }

    const photo = await compressPhoto(data, IMPORTED_PHOTO_SIDE)
    // Only a smaller file is worth the re-encode; a small, already-fitted
    // photo keeps its bytes and its format.
    if (photo.data.length >= data.length) {
      return { data, name, type: mimeFor(name), compressed: false }
    }
    return {
      data: photo.data,
      name: name.replace(PHOTO_NAME, '.jpg'),
      type: 'image/jpeg',
      compressed: true,
    }
  } catch {
    // Not an image sharp can read: kept as it came, like any other document.
    return { data, name, type: mimeFor(name), compressed: false }
  }
}

/**
 * Writes an imported file into `dir` under a generated name, a random UUID
 * with `name`'s extension, and returns that name. It is the shape the upload
 * routes give their files, so the file manager's sweep finds an imported file
 * nothing uses any more, and two attachments never share one file. The name
 * the user knows the file by is kept on its row.
 */
export async function writeImportedFile(dir: string, name: string, data: Buffer): Promise<string> {
  const ext = path.extname(name).slice(1).toLowerCase()
  const stored = `${randomUUID()}.${/^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin'}`
  await writeFile(path.join(dir, stored), data, { flag: 'wx' })
  return stored
}
