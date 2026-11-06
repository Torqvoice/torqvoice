import 'server-only'
import crypto from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { discardUnsavedUpload, isGeneratedName } from '@/lib/files/manager'
import { uploadsRoot } from '@/lib/upload-root'
import { MAX_FIX_PHOTOS } from '../Schema/faultCodeSchema'

/**
 * Photos a phone adds to a fix that is still being written. A shared fix and
 * its photos live in the code service, so these wait here only until the fix
 * is sent, then the file manager discards them.
 *
 * They are ordinary uploads in the workshop's `fix-drafts` folder, handled
 * like every other: deleted only through the file manager, carried by
 * backups, and, as no row ever points at them, moved to the trash by the
 * orphan sweep a week after a draft that was never shared.
 *
 * A file name has no folders, so a draft's photos are told apart by name: a
 * photo is named like any generated upload (`<uuid>.jpg`, which the sweep
 * relies on), with the draft's id in its first four groups and a random last
 * group, e.g. `3f2b…-…-…-…-<12 random hex>.jpg`.
 */
export const FIX_DRAFT_FOLDER = 'fix-drafts'

const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SAFE_ORG = /^[A-Za-z0-9_-]{1,64}$/

export function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && DRAFT_ID.test(value)
}

/** The part of a photo's name that says which draft it belongs to. */
function prefixOf(draftId: string): string {
  return `${draftId.slice(0, 23)}-`
}

function folderOf(organizationId: string): string | null {
  return SAFE_ORG.test(organizationId)
    ? path.join(uploadsRoot(), organizationId, FIX_DRAFT_FOLDER)
    : null
}

function belongs(name: string, draftId: string): boolean {
  return isGeneratedName(name) && name.endsWith('.jpg') && name.startsWith(prefixOf(draftId))
}

/** Where the signed-in app reads a draft photo (the usual protected files route). */
export function draftPhotoUrl(organizationId: string, name: string): string {
  return `/api/protected/files/${organizationId}/${FIX_DRAFT_FOLDER}/${name}`
}

/** The draft's photo names, oldest first. */
export async function listDraftPhotos(organizationId: string, draftId: string): Promise<string[]> {
  const dir = folderOf(organizationId)
  if (!dir || !isDraftId(draftId)) return []
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => belongs(n, draftId))
  const dated = await Promise.all(
    names.map(async (name) => {
      const s = await stat(path.join(dir, name)).catch(() => null)
      return s ? { name, at: s.mtimeMs } : null
    })
  )
  // By time, then name: every reader orders the draft the same way.
  return dated
    .filter((d): d is { name: string; at: number } => d !== null)
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
    .map((d) => d.name)
}

/**
 * Work on one draft runs one at a time. Two phone uploads landing together
 * would otherwise both see three photos and both add one; in turn, the second
 * sees four and is refused. The app serves from one process, so a queue in
 * memory covers every upload a draft gets.
 */
const queues = new Map<string, Promise<unknown>>()

async function inTurn<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve()
  const run = before.then(work, work)
  const tail = run.catch(() => undefined)
  queues.set(key, tail)
  try {
    return await run
  } finally {
    if (queues.get(key) === tail) queues.delete(key)
  }
}

/** Adds a compressed JPEG; null when the draft already holds four. */
export async function addDraftPhoto(
  organizationId: string,
  draftId: string,
  jpeg: Uint8Array,
  max: number = MAX_FIX_PHOTOS
): Promise<{ name: string; count: number } | null> {
  const dir = folderOf(organizationId)
  if (!dir || !isDraftId(draftId)) return null
  return inTurn(`${organizationId}/${draftId}`, async () => {
    const existing = await listDraftPhotos(organizationId, draftId)
    if (existing.length >= max) return null
    await mkdir(dir, { recursive: true })
    const name = `${prefixOf(draftId)}${crypto.randomBytes(6).toString('hex')}.jpg`
    await writeFile(path.join(dir, name), jpeg)
    return { name, count: existing.length + 1 }
  })
}

/** The draft's photos, for sending with the fix. */
export async function readDraftPhotos(organizationId: string, draftId: string): Promise<Buffer[]> {
  const dir = folderOf(organizationId)
  if (!dir) return []
  const names = await listDraftPhotos(organizationId, draftId)
  const files = await Promise.all(
    names.map((name) => readFile(path.join(dir, name)).catch(() => null))
  )
  return files.flatMap((f) => (f ? [f] : []))
}

/** Takes one photo out of a draft, through the file manager. */
export async function removeDraftPhoto(
  organizationId: string,
  draftId: string,
  name: string
): Promise<void> {
  if (!isDraftId(draftId) || !belongs(name, draftId)) return
  await discardUnsavedUpload(organizationId, FIX_DRAFT_FOLDER, name)
}

/** Discards a draft's photos once its fix is shared. */
export async function discardDraft(organizationId: string, draftId: string): Promise<void> {
  const names = await listDraftPhotos(organizationId, draftId)
  await Promise.all(
    names.map((name) => discardUnsavedUpload(organizationId, FIX_DRAFT_FOLDER, name))
  )
}
