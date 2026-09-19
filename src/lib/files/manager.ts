import 'server-only'

import type { Dirent } from 'node:fs'
import { constants, copyFile, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_CATEGORIES } from '@/lib/upload-url'
import { uploadsRoot, uploadsRoots } from '@/lib/upload-root'
import {
  allReferencedSuffixes,
  existingOrganizationIds,
  hasAnyOrganization,
  referencedSuffixes,
} from './references'

/**
 * The one place uploaded files are deleted from disk.
 *
 * Every other module that wants a file gone asks here, and nothing else in
 * `src/` unlinks under the uploads folder (a test holds that line). The rules
 * this file applies to every deletion:
 *
 * 1. Only after the database change has committed. A file is released once
 *    the rows that pointed at it are gone, so a delete that fails half way
 *    leaves the file where its rows still expect it.
 * 2. Only if nothing still points at it. Several rows can share one file (a
 *    tire set's photo copied onto a work order, a job photo sent on WhatsApp,
 *    a logo used by the settings and by a design); `references.ts` lists every
 *    column that can, and a file any of them still mentions is kept.
 * 3. Only inside the workshop's own folder for that kind of file, and only a
 *    plain name: `<uploads>/<org>/<folder>/<name>`. A URL naming another
 *    workshop, an unknown folder, a `..`, a symlink or a directory is left
 *    alone, whatever row it came from.
 * 4. Never an exception into the caller. A failed cleanup must not fail the
 *    delete the user asked for; it is logged, and the file stays.
 * 5. Into a trash first. A released file is moved to
 *    `<uploads>/.trash/<date>/<org>/<folder>/<name>` and only deleted for good
 *    `TRASH_DAYS` later (purgeTrash), so a mistake, a race or a stale save is
 *    still recoverable. The trash is outside every workshop's folder, so it is
 *    never served and never part of a workshop's own export; the server's
 *    backup of the data folder does include it until it is purged.
 *
 * Both upload roots are cleaned (see lib/upload-root.ts), because files have
 * been written under each and a file under either would still be served.
 */

const FOLDERS: ReadonlySet<string> = new Set(UPLOAD_CATEGORIES)
const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/
const STORED_URL = /^\/api\/(?:protected\/)?files\/([^/]+)\/([^/]+)\/([^/]+)$/

/**
 * Names the upload routes generate: a random UUID and an extension, or a
 * video's `_orig` copy that is only there while it is compressed. The sweep
 * only ever considers these; a file named any other way (an import's, the
 * demo seed's) was put there on purpose by something else.
 */
const GENERATED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:_orig)?\.[A-Za-z0-9]{1,8}$/

export interface StoredFile {
  organizationId: string
  folder: string
  name: string
  /** `/<folder>/<name>`: how references.ts finds rows that still use it. */
  suffix: string
}

/** A stored URL taken apart, or null when it is not one of the app's own uploads. */
export function parseStoredFileUrl(url: unknown): StoredFile | null {
  if (typeof url !== 'string') return null
  const match = STORED_URL.exec(url.trim())
  if (!match) return null
  const [, organizationId, folder, name] = match
  if (!ORG_ID.test(organizationId) || !FOLDERS.has(folder)) return null
  if (!FILE_NAME.test(name) || name.includes('..')) return null
  return { organizationId, folder, name, suffix: `/${folder}/${name}` }
}

/** Where the file is under one root, or null if that would be anywhere but its own folder. */
function pathUnder(root: string, file: StoredFile): string | null {
  const folder = path.resolve(root, file.organizationId, file.folder)
  const target = path.resolve(folder, file.name)
  return path.dirname(target) === folder ? target : null
}

/** Days a released file waits in the trash before it is deleted for good. */
export const TRASH_DAYS = 30
const TRASH = '.trash'
const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/

/** Whether the path is a regular file: never a link, never a directory. */
async function isPlainFile(target: string): Promise<boolean> {
  try {
    return (await lstat(target)).isFile()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

/** Whether anything at all is at this path, a broken link included. */
async function taken(target: string): Promise<boolean> {
  return lstat(target).then(
    () => true,
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return false
      throw err
    }
  )
}

/**
 * Moves one regular file into the root's trash, under the day it was
 * released. False when it was not there or was not a plain file. A name
 * already in that day's trash gets a counter, so an earlier release is never
 * overwritten; and a trash on another disk (a folder mounted on its own) is
 * reached by copy and delete, since a rename cannot cross disks.
 */
async function trashFile(root: string, target: string, file: StoredFile, now: number) {
  if (!(await isPlainFile(target))) return false
  const day = new Date(now).toISOString().slice(0, 10)
  const dir = path.join(path.resolve(root), TRASH, day, file.organizationId, file.folder)
  await mkdir(dir, { recursive: true })
  let destination = path.join(dir, file.name)
  for (let n = 1; await taken(destination); n++) {
    destination = path.join(dir, `${file.name}.${n}`)
  }
  try {
    await rename(target, destination)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(target, destination, constants.COPYFILE_EXCL)
    await unlink(target)
  }
  return true
}

/** Deletes one regular file outright; for files nothing ever referenced. */
async function deleteFile(target: string): Promise<boolean> {
  if (!(await isPlainFile(target))) return false
  await unlink(target)
  return true
}

export interface ReleaseResult {
  /** URLs whose file was deleted from at least one root. */
  removed: string[]
  /** URLs still used by some row, so kept. */
  kept: string[]
  /** URLs that are not this workshop's uploads, or could not be checked, so left alone. */
  skipped: string[]
}

/**
 * Deletes the files behind these URLs that no row uses any more. Call it
 * after the rows that pointed at them have been deleted or changed, with the
 * workshop those rows belonged to; a URL naming any other workshop is skipped.
 */
export async function releaseFiles(
  urls: Iterable<string | null | undefined>,
  {
    organizationId,
    reason,
    now = Date.now(),
  }: { organizationId: string; reason: string; now?: number }
): Promise<ReleaseResult> {
  const result: ReleaseResult = { removed: [], kept: [], skipped: [] }
  const candidates = new Map<string, { url: string; file: StoredFile }>()
  for (const url of urls) {
    if (!url) continue
    const file = parseStoredFileUrl(url)
    if (!file || file.organizationId !== organizationId) {
      result.skipped.push(url)
      continue
    }
    if (!candidates.has(file.suffix)) candidates.set(file.suffix, { url, file })
  }
  if (candidates.size === 0) return result

  let inUse: Set<string>
  try {
    inUse = await referencedSuffixes([...candidates.keys()])
  } catch (err) {
    // Unable to tell whether they are in use: keep every one.
    console.error(`[files] could not check references (${reason}); nothing deleted:`, err)
    result.skipped.push(...[...candidates.values()].map((c) => c.url))
    return result
  }

  for (const [suffix, { url, file }] of candidates) {
    if (inUse.has(suffix)) {
      result.kept.push(url)
      continue
    }
    let removed = false
    for (const root of uploadsRoots()) {
      const target = pathUnder(root, file)
      if (!target) continue
      try {
        if (await trashFile(root, target, file, now)) removed = true
      } catch (err) {
        console.error(`[files] could not delete ${file.suffix} (${reason}):`, err)
      }
    }
    if (removed) result.removed.push(url)
  }

  if (result.removed.length > 0) {
    console.warn(
      `[files] ${reason}: moved ${result.removed.length} unused file(s) of ${organizationId} to the trash: ${result.removed
        .map((url) => parseStoredFileUrl(url)?.suffix)
        .join(', ')}`
    )
  }
  return result
}

/**
 * A file an upload has just written whose row was never saved, or the
 * temporary original of a video once its compressed copy exists. Nothing can
 * reference it, so it goes without the check; the folder and name are still
 * validated, and only the root it was written to is touched.
 */
export async function discardUnsavedUpload(
  organizationId: string,
  folder: string,
  name: string
): Promise<void> {
  if (!ORG_ID.test(organizationId) || !FOLDERS.has(folder)) return
  if (!FILE_NAME.test(name) || name.includes('..')) return
  const target = pathUnder(uploadsRoot(), {
    organizationId,
    folder,
    name,
    suffix: `/${folder}/${name}`,
  })
  if (!target) return
  await deleteFile(target).catch((err) =>
    console.error(`[files] could not discard /${folder}/${name}:`, err)
  )
}

/** A workshop's own directory under one root, or null for an id that is not one. */
function organizationDir(root: string, organizationId: string): string | null {
  if (!ORG_ID.test(organizationId)) return null
  const base = path.resolve(root)
  const dir = path.resolve(base, organizationId)
  return path.dirname(dir) === base ? dir : null
}

/**
 * Everything a workshop uploaded, under every root, and its trash: only when
 * the workshop itself is deleted. Gone at once, not trashed: nothing of a
 * deleted workshop is kept.
 */
export async function removeOrganizationFiles(organizationId: string): Promise<void> {
  for (const root of uploadsRoots()) {
    const dir = organizationDir(root, organizationId)
    if (!dir) return
    await rm(dir, { recursive: true, force: true }).catch((err) =>
      console.error(`[files] could not remove the uploads of ${organizationId}:`, err)
    )
    let days: Dirent[] = []
    try {
      days = await readdir(path.join(path.resolve(root), TRASH), { withFileTypes: true })
    } catch {
      continue
    }
    for (const day of days) {
      if (!day.isDirectory() || !DAY_FOLDER.test(day.name)) continue
      await rm(path.join(path.resolve(root), TRASH, day.name, organizationId), {
        recursive: true,
        force: true,
      }).catch(() => undefined)
    }
  }
}

/**
 * After a backup has written its files into one of the workshop's folders:
 * the files there that the backup did not bring back go through the same
 * release as any other, so one that a row still uses (uploaded after the
 * backup was taken, and not replaced by it) stays. The folder used to be
 * emptied before the restore, and took such files with it.
 */
export async function releaseFilesNotRestored(
  organizationId: string,
  folder: string,
  restoredNames: ReadonlySet<string>
): Promise<ReleaseResult | null> {
  if (!FOLDERS.has(folder)) return null
  const dir = organizationDir(uploadsRoot(), organizationId)
  if (!dir) return null
  let entries: Dirent[]
  try {
    entries = await readdir(path.join(dir, folder), { withFileTypes: true })
  } catch {
    return null
  }
  const stale = entries
    .filter((entry) => entry.isFile() && !restoredNames.has(entry.name))
    .map((entry) => `/api/protected/files/${organizationId}/${folder}/${entry.name}`)
  return releaseFiles(stale, { organizationId, reason: `backup restored over ${folder}` })
}

export interface SweepResult {
  checked: number
  removed: number
  /** Set when the run stopped itself instead of removing anything. */
  refused?: string
  /** Workshops left alone this run, and why. */
  skipped: { organizationId: string; reason: string }[]
  /** Unused files left for the next run by the per-run limit. */
  deferred: number
}

/** The most files one run moves; a backlog is worked through over several nights. */
const SWEEP_MAX_PER_RUN = 1000
/**
 * A workshop where more than this share of the files looked at seem unused is
 * left alone, once there are a few: that is what a wrong or half-restored
 * database looks like, not a few abandoned uploads.
 */
const SWEEP_MAX_SHARE = 0.5
const SWEEP_MIN_FOR_SHARE = 20
/**
 * Set to 1 to lift the share check for a run, after confirming by hand that
 * the database is the right one and the files really are unused (a workshop
 * that deleted most of its history before this manager existed).
 */
const SWEEP_TRUST_DATABASE = 'FILE_SWEEP_TRUST_DATABASE'

interface SweepCandidate {
  root: string
  file: StoredFile
  target: string
  mtimeMs: number
}

/**
 * Files no row points at, left behind by an upload whose second step never
 * happened (the page closed between writing the file and saving its row) or
 * by deletes before this manager existed. Moved to the trash like any other
 * release. Guarded against being pointed at the wrong database, which would
 * make every file look unused:
 *
 * - it looks only in the folders of workshops this database has, and not at
 *   all if the database has none (an empty or half-restored database, or a
 *   test server sharing the disk with another install);
 * - it leaves alone any workshop where more than half the files it looked at
 *   seem unused, and says so in the log;
 * - it moves at most SWEEP_MAX_PER_RUN files a run, oldest first, and checks
 *   those once more against the database right before moving them;
 * - only names the upload routes generate, only files older than `minAgeMs`
 *   (a week, so a form left open with an upload in it is not caught), and only
 *   through the same reference lists every other deletion uses.
 */
export async function sweepOrphanFiles({
  now = Date.now(),
  minAgeMs = 7 * 24 * 60 * 60 * 1000,
  maxPerRun = SWEEP_MAX_PER_RUN,
  trustDatabase = process.env[SWEEP_TRUST_DATABASE] === '1',
}: {
  now?: number
  minAgeMs?: number
  maxPerRun?: number
  trustDatabase?: boolean
} = {}): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, removed: 0, skipped: [], deferred: 0 }
  const refuse = (reason: string, err?: unknown) => {
    result.refused = reason
    console.error(`[files] sweep refused, nothing moved: ${reason}`, ...(err ? [err] : []))
    return result
  }
  if (!(await hasAnyOrganization())) return refuse('the database has no workshops')

  let used: Set<string>
  try {
    used = await allReferencedSuffixes()
  } catch (err) {
    return refuse('the database could not say which files are in use', err)
  }

  // Old enough, generated names, in known workshops' folders; per workshop.
  const perWorkshop = new Map<string, { checked: number; unused: SweepCandidate[] }>()
  for (const root of uploadsRoots()) {
    let dirs: Dirent[]
    try {
      dirs = await readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    const ids = dirs
      .filter((dir) => dir.isDirectory() && organizationDir(root, dir.name))
      .map((dir) => dir.name)
    const known = await existingOrganizationIds(ids)

    for (const organizationId of ids.filter((id) => known.has(id))) {
      const tally = perWorkshop.get(organizationId) ?? { checked: 0, unused: [] }
      perWorkshop.set(organizationId, tally)
      for (const folder of FOLDERS) {
        let entries: Dirent[]
        try {
          entries = await readdir(path.join(root, organizationId, folder), { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          if (!entry.isFile() || !GENERATED_NAME.test(entry.name)) continue
          const file = {
            organizationId,
            folder,
            name: entry.name,
            suffix: `/${folder}/${entry.name}`,
          }
          const target = pathUnder(root, file)
          if (!target) continue
          const stats = await lstat(target).catch(() => null)
          if (!stats?.isFile() || now - stats.mtimeMs < minAgeMs) continue
          tally.checked += 1
          if (!used.has(file.suffix)) {
            tally.unused.push({ root, file, target, mtimeMs: stats.mtimeMs })
          }
        }
      }
    }
  }

  const unused: SweepCandidate[] = []
  for (const [organizationId, { checked, unused: theirs }] of perWorkshop) {
    result.checked += checked
    const share = checked > 0 ? theirs.length / checked : 0
    if (!trustDatabase && checked >= SWEEP_MIN_FOR_SHARE && share > SWEEP_MAX_SHARE) {
      const reason = `${theirs.length} of ${checked} files look unused, more than a sweep should find; check the database, then run with ${SWEEP_TRUST_DATABASE}=1 if they really are`
      result.skipped.push({ organizationId, reason })
      console.error(`[files] sweep left ${organizationId} alone: ${reason}`)
      continue
    }
    unused.push(...theirs)
  }

  // Oldest first, a bounded number a night.
  unused.sort((a, b) => a.mtimeMs - b.mtimeMs)
  const chosen = unused.slice(0, maxPerRun)
  result.deferred = unused.length - chosen.length

  // The list of used files is from the start of the run: ask again for these.
  let stillUsed: Set<string>
  try {
    stillUsed = await referencedSuffixes([...new Set(chosen.map(({ file }) => file.suffix))])
  } catch (err) {
    return refuse('the database could not say which files are in use', err)
  }

  for (const { root, file, target } of chosen) {
    if (stillUsed.has(file.suffix)) continue
    if (await trashFile(root, target, file, now).catch(() => false)) {
      result.removed += 1
      console.warn(
        `[files] sweep: moved unused ${file.suffix} of ${file.organizationId} to the trash`
      )
    }
  }
  if (result.deferred > 0) {
    console.warn(`[files] sweep: ${result.deferred} more unused file(s) left for the next run`)
  }
  return result
}

/**
 * Deletes for good what has been in the trash longer than `keepDays`. Only
 * day folders inside each root's `.trash`, nothing else.
 */
export async function purgeTrash({
  now = Date.now(),
  keepDays = TRASH_DAYS,
}: {
  now?: number
  keepDays?: number
} = {}): Promise<number> {
  let purged = 0
  const cutoff = new Date(now - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  for (const root of uploadsRoots()) {
    const trash = path.join(path.resolve(root), TRASH)
    let days: Dirent[]
    try {
      days = await readdir(trash, { withFileTypes: true })
    } catch {
      continue
    }
    for (const day of days) {
      if (!day.isDirectory() || !DAY_FOLDER.test(day.name) || day.name >= cutoff) continue
      await rm(path.join(trash, day.name), { recursive: true, force: true })
      purged += 1
    }
  }
  return purged
}
