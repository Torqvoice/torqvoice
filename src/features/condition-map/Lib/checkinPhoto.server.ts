import 'server-only'
import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { compressPhoto } from '@/lib/image-upload.server'
import { uploadsRoot } from '@/lib/upload-root'

/**
 * A photo from the technician app's check-in, stored the way the web's photo
 * walk stores one: decoded and re-encoded as a JPEG no wider than the walk's,
 * under a generated name in the job's folder. What arrives is the phone's
 * word for what it is; what is kept is only what sharp could read.
 */

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

/** A phone's full-size photo is a few megabytes; this leaves room and no more. */
export const MAX_CHECKIN_PHOTO_BYTES = 30 * 1024 * 1024

export type SavedPhoto = { url: string; fileName: string; size: number; filename: string }
export type PhotoRefusal = 'noFile' | 'type' | 'empty' | 'tooLarge'

export const PHOTO_REFUSALS: Record<PhotoRefusal, string> = {
  noFile: 'No photo was attached.',
  type: 'That file is not a photo we can read.',
  empty: 'That photo is empty.',
  tooLarge: 'That photo is too large.',
}

export async function saveCheckinPhoto(
  organizationId: string,
  file: FormDataEntryValue | null
): Promise<SavedPhoto | { refused: PhotoRefusal }> {
  if (!(file instanceof File)) return { refused: 'noFile' }
  if (!PHOTO_TYPES.has(file.type)) return { refused: 'type' }
  if (file.size === 0) return { refused: 'empty' }
  if (file.size > MAX_CHECKIN_PHOTO_BYTES) return { refused: 'tooLarge' }

  let data: Buffer
  try {
    data = (await compressPhoto(Buffer.from(await file.arrayBuffer()))).data
  } catch {
    // Not a picture sharp can read, whatever it called itself.
    return { refused: 'type' }
  }

  const filename = `${crypto.randomUUID()}.jpg`
  const dir = path.join(uploadsRoot(), organizationId, 'services')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), data)
  return {
    url: `/api/protected/files/${organizationId}/services/${filename}`,
    // The phone's name as a label only, with the extension the file has now.
    fileName: `${(file.name || 'photo').replace(/\.[^.]*$/, '').slice(0, 190)}.jpg`,
    size: data.length,
    filename,
  }
}
