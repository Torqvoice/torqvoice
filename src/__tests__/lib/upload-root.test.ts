import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { dataRoot, orgUploadDir, uploadsRoot, uploadsRoots } from '@/lib/upload-root'

/**
 * Where uploaded files live, and why moving them loses nothing.
 *
 * `DATA_ROOT` moves the data directory for a self-hosted install whose spare
 * disk is not the one the app was unpacked on. The seed script has honoured it
 * since it was written and the app never did, so anyone who set it had their
 * files written to the default regardless. That is the whole risk in turning
 * it on, and the reason a read tries the configured root and then the old
 * default: a file already on disk keeps resolving, wherever it was put.
 */

const ORIGINAL = process.env.DATA_ROOT

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATA_ROOT
  else process.env.DATA_ROOT = ORIGINAL
})

describe('the data directory', () => {
  it('is data beside the app when nothing says otherwise', () => {
    delete process.env.DATA_ROOT
    expect(dataRoot()).toBe(path.join(process.cwd(), 'data'))
    expect(uploadsRoot()).toBe(path.join(process.cwd(), 'data', 'uploads'))
    // One root, so nothing is looked for twice.
    expect(uploadsRoots()).toEqual([path.join(process.cwd(), 'data', 'uploads')])
  })

  it('is wherever the installation says', () => {
    process.env.DATA_ROOT = '/var/lib/torqvoice'
    expect(uploadsRoot()).toBe('/var/lib/torqvoice/uploads')
    expect(orgUploadDir('org_1', 'services')).toBe('/var/lib/torqvoice/uploads/org_1/services')
  })

  it('still knows where files were written before it read the variable', () => {
    process.env.DATA_ROOT = '/var/lib/torqvoice'
    expect(uploadsRoots()).toEqual([
      '/var/lib/torqvoice/uploads',
      path.join(process.cwd(), 'data', 'uploads'),
    ])
  })
})

describe('resolving a stored file after the data directory moves', () => {
  it('finds one that was written before the move', () => {
    // The old default is the working directory's, so this is written there.
    const relative = path.join('org_upgrade', 'services', 'before.pdf')
    const legacy = path.join(process.cwd(), 'data', 'uploads', relative)
    mkdirSync(path.dirname(legacy), { recursive: true })
    writeFileSync(legacy, 'old')

    process.env.DATA_ROOT = mkdtempSync(path.join(tmpdir(), 'torqvoice-data-'))
    expect(resolveUploadPath(`/api/protected/files/${relative}`)).toBe(legacy)
  })

  it('prefers the configured root when the file is there', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'torqvoice-data-'))
    process.env.DATA_ROOT = root
    const relative = path.join('org_moved', 'services', 'after.pdf')
    const moved = path.join(root, 'uploads', relative)
    mkdirSync(path.dirname(moved), { recursive: true })
    writeFileSync(moved, 'new')

    expect(resolveUploadPath(`/api/protected/files/${relative}`)).toBe(moved)
  })

  it('names the configured root for a file that is in neither', () => {
    // So the caller's own read reports a missing file, rather than this
    // reporting a path nobody asked about.
    process.env.DATA_ROOT = '/var/lib/torqvoice'
    expect(resolveUploadPath('/api/protected/files/org_x/services/gone.pdf')).toBe(
      '/var/lib/torqvoice/uploads/org_x/services/gone.pdf'
    )
  })

  it('refuses a stored path that would climb out of either root', () => {
    // A stored value is something somebody typed at some point, and `..` in it
    // must never reach readFile or unlink.
    process.env.DATA_ROOT = '/var/lib/torqvoice'
    expect(() => resolveUploadPath('/api/protected/files/../../etc/passwd')).toThrow()
  })
})
