/**
 * @vitest-environment node
 *
 * The file manager is the only code that deletes uploads, so these tests run
 * it against a real directory tree: two upload roots in a temporary folder,
 * two workshops, files, a symlink and a directory. Only the database's answer
 * to "is this file still used?" is stood in for, so each test can say which
 * files some row still points at.
 */
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real file system, with `rename` able to fail the way it does across disks.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const roots = vi.hoisted(() => ({ current: '', legacy: '' }))
vi.mock('@/lib/upload-root', () => ({
  uploadsRoot: () => roots.current,
  uploadsRoots: () => [roots.current, roots.legacy],
}))

const inUse = vi.hoisted(() => ({
  suffixes: new Set<string>(),
  fail: false,
  /** The workshops the connected database has. */
  organizations: new Set<string>(),
  /** Rows written after the sweep read its list, seen only when asked again. */
  later: new Set<string>(),
}))
const referencedSuffixes = vi.hoisted(() =>
  vi.fn(async (suffixes: string[]) => {
    if (inUse.fail) throw new Error('database unavailable')
    return new Set(suffixes.filter((s) => inUse.suffixes.has(s) || inUse.later.has(s)))
  })
)
const allReferencedSuffixes = vi.hoisted(() =>
  vi.fn(async () => {
    if (inUse.fail) throw new Error('database unavailable')
    return new Set(inUse.suffixes)
  })
)
vi.mock('@/lib/files/references', () => ({
  referencedSuffixes,
  allReferencedSuffixes,
  existingOrganizationIds: async (ids: string[]) =>
    new Set(ids.filter((id) => inUse.organizations.has(id))),
  hasAnyOrganization: async () => inUse.organizations.size > 0,
}))

import {
  discardUnsavedUpload,
  parseStoredFileUrl,
  purgeTrash,
  releaseFiles,
  releaseFilesNotRestored,
  removeOrganizationFiles,
  sweepOrphanFiles,
} from '@/lib/files/manager'

const ORG = 'orgA'
const OTHER = 'orgB'
const PHOTO = '0b2b4d6a-1c3e-4f5a-8b7c-9d0e1f2a3b4c.jpg'
const PHOTO_2 = '1c3e4f5a-2d4f-4a6b-9c8d-0e1f2a3b4c5d.jpg'
const url = (org: string, folder: string, name: string) =>
  `/api/protected/files/${org}/${folder}/${name}`

let base = ''
const NOW = Date.UTC(2026, 8, 19, 12)
const TODAY = '2026-09-19'
/** Where a file released today lands in a root's trash. */
const trashed = (root: string, org: string, folder: string, name: string) =>
  path.join(root, '.trash', TODAY, org, folder, name)

async function put(root: string, org: string, folder: string, name: string, ageHours = 0) {
  const dir = path.join(root, org, folder)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, name)
  await writeFile(file, 'bytes')
  if (ageHours) {
    const when = new Date(Date.now() - ageHours * 3600_000)
    await utimes(file, when, when)
  }
  return file
}

beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), 'torqvoice-files-'))
  roots.current = path.join(base, 'uploads')
  roots.legacy = path.join(base, 'legacy-uploads')
  inUse.suffixes = new Set()
  inUse.fail = false
  inUse.organizations = new Set([ORG, OTHER])
  inUse.later = new Set()
  referencedSuffixes.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(base, { recursive: true, force: true })
})

describe('parseStoredFileUrl', () => {
  it('reads both URL shapes the app has stored', () => {
    expect(parseStoredFileUrl(url(ORG, 'services', PHOTO))).toEqual({
      organizationId: ORG,
      folder: 'services',
      name: PHOTO,
      suffix: `/services/${PHOTO}`,
    })
    expect(parseStoredFileUrl(`/api/files/${ORG}/vehicles/${PHOTO}`)?.folder).toBe('vehicles')
  })

  it('refuses anything that is not plainly one of the app’s own uploads', () => {
    for (const bad of [
      null,
      undefined,
      42,
      '',
      `/api/protected/files/${ORG}/services/../logos/${PHOTO}`,
      `/api/protected/files/${ORG}/services/..`,
      `/api/protected/files/${ORG}/secrets/${PHOTO}`,
      `/api/protected/files/../services/${PHOTO}`,
      `/api/protected/files/${ORG}/services/sub/${PHOTO}`,
      `/api/protected/files/${ORG}/services/.hidden`,
      `/uploads/services/${PHOTO}`,
      `https://example.com/api/protected/files/${ORG}/services/${PHOTO}`,
      `/api/protected/files/${ORG}/services/a%2F..%2Fb.jpg`,
    ]) {
      expect(parseStoredFileUrl(bad), String(bad)).toBeNull()
    }
  })
})

describe('releaseFiles', () => {
  it('moves a file nothing uses to the trash, from every root it is under', async () => {
    const current = await put(roots.current, ORG, 'services', PHOTO)
    const legacy = await put(roots.legacy, ORG, 'services', PHOTO)

    const result = await releaseFiles([url(ORG, 'services', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
      now: NOW,
    })

    expect(result.removed).toEqual([url(ORG, 'services', PHOTO)])
    expect(existsSync(current)).toBe(false)
    expect(existsSync(legacy)).toBe(false)
    // Recoverable for a month: each root keeps its own trash.
    expect(existsSync(trashed(roots.current, ORG, 'services', PHOTO))).toBe(true)
    expect(existsSync(trashed(roots.legacy, ORG, 'services', PHOTO))).toBe(true)
  })

  it('keeps a file some row still uses (a tire set photo also on a work order)', async () => {
    const file = await put(roots.current, ORG, 'tire-hotel', PHOTO)
    inUse.suffixes.add(`/tire-hotel/${PHOTO}`)

    const result = await releaseFiles([url(ORG, 'tire-hotel', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
    })

    expect(result.kept).toEqual([url(ORG, 'tire-hotel', PHOTO)])
    expect(existsSync(file)).toBe(true)
  })

  it('never touches another workshop’s file, whatever URL a row holds', async () => {
    const theirs = await put(roots.current, OTHER, 'services', PHOTO)

    const result = await releaseFiles([url(OTHER, 'services', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
    })

    expect(result.skipped).toEqual([url(OTHER, 'services', PHOTO)])
    expect(existsSync(theirs)).toBe(true)
    expect(referencedSuffixes).not.toHaveBeenCalled()
  })

  it('deletes nothing when it cannot tell whether a file is in use', async () => {
    const file = await put(roots.current, ORG, 'services', PHOTO)
    inUse.fail = true

    const result = await releaseFiles([url(ORG, 'services', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
    })

    expect(result.removed).toEqual([])
    expect(existsSync(file)).toBe(true)
  })

  it('does not follow a symlink or remove a directory of the same name', async () => {
    const outside = path.join(base, 'outside.txt')
    await writeFile(outside, 'not an upload')
    await mkdir(path.join(roots.current, ORG, 'services'), { recursive: true })
    await symlink(outside, path.join(roots.current, ORG, 'services', PHOTO))
    await mkdir(path.join(roots.current, ORG, 'services', PHOTO_2), { recursive: true })

    const result = await releaseFiles(
      [url(ORG, 'services', PHOTO), url(ORG, 'services', PHOTO_2)],
      { organizationId: ORG, reason: 'test' }
    )

    expect(result.removed).toEqual([])
    expect(existsSync(outside)).toBe(true)
    expect(existsSync(path.join(roots.current, ORG, 'services', PHOTO))).toBe(true)
    expect((await stat(path.join(roots.current, ORG, 'services', PHOTO_2))).isDirectory()).toBe(
      true
    )
  })

  it('checks each file once, ignores empty values, and never throws', async () => {
    await put(roots.current, ORG, 'services', PHOTO)
    const result = await releaseFiles(
      [url(ORG, 'services', PHOTO), url(ORG, 'services', PHOTO), null, undefined, ''],
      { organizationId: ORG, reason: 'test' }
    )
    expect(result.removed).toHaveLength(1)
    expect(referencedSuffixes).toHaveBeenCalledWith([`/services/${PHOTO}`])
  })

  it('leaves the rest of the folder alone', async () => {
    await put(roots.current, ORG, 'services', PHOTO)
    const neighbour = await put(roots.current, ORG, 'services', PHOTO_2)
    await releaseFiles([url(ORG, 'services', PHOTO)], { organizationId: ORG, reason: 'test' })
    expect(existsSync(neighbour)).toBe(true)
  })

  it('never overwrites a file already in the day’s trash under the same name', async () => {
    const release = () =>
      releaseFiles([url(ORG, 'services', PHOTO)], { organizationId: ORG, reason: 'test', now: NOW })
    const file = await put(roots.current, ORG, 'services', PHOTO)
    await writeFile(file, 'first')
    await release()
    await writeFile(await put(roots.current, ORG, 'services', PHOTO), 'second')
    await release()

    const first = trashed(roots.current, ORG, 'services', PHOTO)
    expect(await readFile(first, 'utf8')).toBe('first')
    expect(await readFile(`${first}.1`, 'utf8')).toBe('second')
  })

  it('copies then deletes when the trash is on another disk', async () => {
    const file = await put(roots.current, ORG, 'services', PHOTO)
    vi.mocked(rename).mockRejectedValueOnce(
      Object.assign(new Error('cross-device link'), { code: 'EXDEV' })
    )

    const result = await releaseFiles([url(ORG, 'services', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
      now: NOW,
    })

    expect(result.removed).toHaveLength(1)
    expect(existsSync(file)).toBe(false)
    expect(await readFile(trashed(roots.current, ORG, 'services', PHOTO), 'utf8')).toBe('bytes')
  })

  it('keeps the file when the move fails for any other reason', async () => {
    const file = await put(roots.current, ORG, 'services', PHOTO)
    vi.mocked(rename).mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))

    const result = await releaseFiles([url(ORG, 'services', PHOTO)], {
      organizationId: ORG,
      reason: 'test',
    })

    vi.mocked(rename).mockReset()
    expect(result.removed).toEqual([])
    expect(existsSync(file)).toBe(true)
  })
})

describe('discardUnsavedUpload', () => {
  it('removes the file an upload just wrote, and nothing outside its folder', async () => {
    const file = await put(roots.current, ORG, 'services', PHOTO)
    const outside = path.join(base, 'keep.txt')
    await writeFile(outside, 'x')

    await discardUnsavedUpload(ORG, 'services', PHOTO)
    await discardUnsavedUpload(ORG, 'services', '../../../keep.txt')
    await discardUnsavedUpload('..', 'services', PHOTO)
    await discardUnsavedUpload(ORG, 'nowhere', PHOTO)

    expect(existsSync(file)).toBe(false)
    expect(existsSync(outside)).toBe(true)
  })
})

describe('removeOrganizationFiles', () => {
  it('removes the workshop’s folder and its trash under both roots, and nobody else’s', async () => {
    await put(roots.current, ORG, 'services', PHOTO)
    await put(roots.legacy, ORG, 'logos', PHOTO)
    await put(roots.current, OTHER, 'services', PHOTO_2)
    await releaseFiles([url(OTHER, 'services', PHOTO_2)], {
      organizationId: OTHER,
      reason: 'test',
      now: NOW,
    })
    await put(roots.current, ORG, 'quotes', PHOTO_2)
    await releaseFiles([url(ORG, 'quotes', PHOTO_2)], {
      organizationId: ORG,
      reason: 'test',
      now: NOW,
    })
    const theirs = await put(roots.current, OTHER, 'services', PHOTO)

    await removeOrganizationFiles(ORG)

    expect(existsSync(path.join(roots.current, ORG))).toBe(false)
    expect(existsSync(path.join(roots.legacy, ORG))).toBe(false)
    expect(existsSync(path.join(roots.current, '.trash', TODAY, ORG))).toBe(false)
    expect(existsSync(theirs)).toBe(true)
    expect(existsSync(trashed(roots.current, OTHER, 'services', PHOTO_2))).toBe(true)
  })

  it('refuses an id that is not one, rather than removing the uploads root', async () => {
    const theirs = await put(roots.current, OTHER, 'services', PHOTO)
    for (const bad of ['', '.', '..', '../x', 'a/b', `${OTHER}/..`, '.trash']) {
      await removeOrganizationFiles(bad)
    }
    expect(existsSync(theirs)).toBe(true)
    expect(existsSync(roots.current)).toBe(true)
  })
})

describe('releaseFilesNotRestored (after a backup restore)', () => {
  it('keeps what the backup brought back and what a row still uses, and trashes the rest', async () => {
    const restored = await put(roots.current, ORG, 'services', PHOTO)
    const newerButUsed = await put(
      roots.current,
      ORG,
      'services',
      '4f6b8c0d-5a7c-4d9e-8f1a-3b4c5d6e7f80.jpg'
    )
    inUse.suffixes.add('/services/4f6b8c0d-5a7c-4d9e-8f1a-3b4c5d6e7f80.jpg')
    const stale = await put(roots.current, ORG, 'services', PHOTO_2)
    const otherFolder = await put(roots.current, ORG, 'quotes', PHOTO_2)

    await releaseFilesNotRestored(ORG, 'services', new Set([PHOTO]))

    expect(existsSync(restored)).toBe(true)
    expect(existsSync(newerButUsed)).toBe(true)
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(otherFolder)).toBe(true)
  })

  it('touches nothing for a folder or workshop that is not one', async () => {
    const file = await put(roots.current, ORG, 'services', PHOTO)
    expect(await releaseFilesNotRestored(ORG, '..', new Set())).toBeNull()
    expect(await releaseFilesNotRestored('..', 'services', new Set())).toBeNull()
    expect(existsSync(file)).toBe(true)
  })
})

describe('sweepOrphanFiles', () => {
  const WEEK_AND_A_DAY = 24 * 8

  it('moves only old, unused files with generated names to the trash', async () => {
    const orphan = await put(roots.current, ORG, 'services', PHOTO, WEEK_AND_A_DAY)
    const orphanTemp = await put(
      roots.legacy,
      ORG,
      'services',
      '2d4f6a8b-3e5a-4b7c-8d9e-1f2a3b4c5d6e_orig.mov',
      WEEK_AND_A_DAY
    )
    // A form can sit open with its upload for days: younger than a week stays.
    const fresh = await put(roots.current, ORG, 'services', PHOTO_2, 24 * 3)
    const usedName = '3e5a7b9c-4f6b-4c8d-9e0f-2a3b4c5d6e7f.jpg'
    const used = await put(roots.current, OTHER, 'vehicles', usedName, WEEK_AND_A_DAY)
    inUse.suffixes.add(`/vehicles/${usedName}`)
    const seeded = await put(roots.current, ORG, 'vehicles', 'ford-f150-white.jpg', WEEK_AND_A_DAY)
    const unknownFolder = await put(roots.current, ORG, 'backups', PHOTO, WEEK_AND_A_DAY)
    // Enough files that are in use for the run to look like a normal one.
    for (let i = 0; i < 30; i++) {
      const name = `5a7c9e1f-6b8d-4f0a-9b2c-${String(i).padStart(12, '0')}.jpg`
      await put(roots.current, ORG, 'quotes', name, WEEK_AND_A_DAY)
      inUse.suffixes.add(`/quotes/${name}`)
    }

    const result = await sweepOrphanFiles({ now: NOW })

    expect(result.refused).toBeUndefined()
    expect(existsSync(orphan)).toBe(false)
    expect(existsSync(trashed(roots.current, ORG, 'services', PHOTO))).toBe(true)
    expect(existsSync(orphanTemp)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    expect(existsSync(used)).toBe(true)
    expect(existsSync(seeded)).toBe(true)
    expect(existsSync(unknownFolder)).toBe(true)
    expect(result.removed).toBe(2)
  })

  it('never looks in the folder of a workshop this database does not have', async () => {
    // A test server sharing a disk with another install, or a restored disk
    // in front of the wrong database: those folders are not its to judge.
    const theirs = await put(roots.current, 'someoneElse', 'services', PHOTO, WEEK_AND_A_DAY)
    const result = await sweepOrphanFiles({ now: NOW })
    expect(existsSync(theirs)).toBe(true)
    expect(result.checked).toBe(0)
  })

  it('refuses to run against a database with no workshops', async () => {
    inUse.organizations = new Set()
    const orphan = await put(roots.current, ORG, 'services', PHOTO, WEEK_AND_A_DAY)
    const result = await sweepOrphanFiles({ now: NOW })
    expect(result.refused).toMatch(/no workshops/)
    expect(existsSync(orphan)).toBe(true)
  })

  /** `count` old files in a folder, none of them used; their paths. */
  async function unusedFiles(
    org: string,
    folder: string,
    count: number,
    ageHours = WEEK_AND_A_DAY
  ) {
    const files: string[] = []
    for (let i = 0; i < count; i++) {
      const name = `6b8d0f2a-7c9e-4a1b-8c3d-${String(i).padStart(12, '0')}.jpg`
      files.push(await put(roots.current, org, folder, name, ageHours))
    }
    return files
  }

  /** `count` old files in a folder that rows use. */
  async function usedFiles(org: string, folder: string, count: number) {
    for (let i = 0; i < count; i++) {
      const name = `7c9e1f3b-8d0f-4b2c-9d4e-${String(i).padStart(12, '0')}.jpg`
      await put(roots.current, org, folder, name, WEEK_AND_A_DAY)
      inUse.suffixes.add(`/${folder}/${name}`)
    }
  }

  it('leaves alone a workshop where most files look unused, and still sweeps the others', async () => {
    const suspicious = await unusedFiles(ORG, 'services', 25)
    await usedFiles(OTHER, 'quotes', 30)
    const orphan = await put(roots.current, OTHER, 'services', PHOTO, WEEK_AND_A_DAY)

    const result = await sweepOrphanFiles({ now: NOW })

    expect(result.refused).toBeUndefined()
    expect(result.skipped).toEqual([
      { organizationId: ORG, reason: expect.stringMatching(/25 of 25 files look unused/) },
    ])
    for (const file of suspicious) expect(existsSync(file)).toBe(true)
    expect(existsSync(orphan)).toBe(false)
    expect(result.removed).toBe(1)
  })

  it('sweeps such a workshop only when told the database is the right one', async () => {
    const files = await unusedFiles(ORG, 'services', 25)
    const result = await sweepOrphanFiles({ now: NOW, trustDatabase: true })
    expect(result.skipped).toEqual([])
    expect(result.removed).toBe(25)
    for (const file of files) expect(existsSync(file)).toBe(false)
  })

  it('moves at most the per-run limit, oldest first, and leaves the rest for later', async () => {
    await usedFiles(ORG, 'quotes', 30)
    // Read first (folders are walked in a fixed order), but the newest.
    const newer = await unusedFiles(ORG, 'vehicles', 3, WEEK_AND_A_DAY)
    const oldest = await put(roots.current, ORG, 'tire-hotel', PHOTO, WEEK_AND_A_DAY * 4)
    const older = await put(roots.current, ORG, 'portal', PHOTO_2, WEEK_AND_A_DAY * 2)

    const result = await sweepOrphanFiles({ now: NOW, maxPerRun: 2 })

    expect(result.removed).toBe(2)
    expect(result.deferred).toBe(3)
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(older)).toBe(false)
    for (const file of newer) expect(existsSync(file)).toBe(true)

    // The next night takes the rest.
    const next = await sweepOrphanFiles({ now: NOW, maxPerRun: 2 })
    expect(next.removed).toBe(2)
    expect(next.deferred).toBe(1)
  })

  it('asks again right before moving, and keeps a file a row started using meanwhile', async () => {
    await usedFiles(ORG, 'quotes', 30)
    const orphan = await put(roots.current, ORG, 'services', PHOTO, WEEK_AND_A_DAY)
    const nowUsed = await put(roots.current, ORG, 'services', PHOTO_2, WEEK_AND_A_DAY)
    inUse.later.add(`/services/${PHOTO_2}`)

    const result = await sweepOrphanFiles({ now: NOW })

    expect(referencedSuffixes).toHaveBeenCalledTimes(1)
    expect(existsSync(orphan)).toBe(false)
    expect(existsSync(nowUsed)).toBe(true)
    expect(result.removed).toBe(1)
  })

  it('removes nothing when the database cannot answer', async () => {
    const orphan = await put(roots.current, ORG, 'services', PHOTO, WEEK_AND_A_DAY)
    inUse.fail = true
    const result = await sweepOrphanFiles({ now: NOW })
    expect(result.refused).toBeDefined()
    expect(existsSync(orphan)).toBe(true)
  })

  it('skips symlinks and folders that are not workshops', async () => {
    const outside = path.join(base, 'outside.jpg')
    await writeFile(outside, 'x')
    await mkdir(path.join(roots.current, ORG, 'services'), { recursive: true })
    await symlink(outside, path.join(roots.current, ORG, 'services', PHOTO))
    await put(roots.current, 'not a workshop', 'services', PHOTO_2, WEEK_AND_A_DAY)

    await sweepOrphanFiles({ now: NOW })

    expect(existsSync(outside)).toBe(true)
    expect(await readdir(path.join(roots.current, 'not a workshop', 'services'))).toEqual([PHOTO_2])
  })
})

describe('purgeTrash', () => {
  it('deletes trash days older than the keep period, and only those', async () => {
    const old = path.join(roots.current, '.trash', '2026-08-01', ORG, 'services', PHOTO)
    const recent = path.join(roots.current, '.trash', '2026-09-10', ORG, 'services', PHOTO)
    const stray = path.join(roots.current, '.trash', 'not-a-day', 'keep.txt')
    for (const file of [old, recent, stray]) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, 'x')
    }

    expect(await purgeTrash({ now: NOW, keepDays: 30 })).toBe(1)

    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
    expect(existsSync(stray)).toBe(true)
  })
})
