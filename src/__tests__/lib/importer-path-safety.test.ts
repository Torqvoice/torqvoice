/**
 * Regression + security proof for the backup importers' path handling.
 *
 * These tests replicate the EXACT filesystem path operations.
 *   1. legitimate backup files still resolve, read, and extract as before, and
 *   2. path-traversal / zip-slip inputs are now blocked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, stat } from 'fs/promises'
import { readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'
import { resolveWithinDir } from '@/lib/safe-path'

let sandbox: string

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(os.tmpdir(), 'importer-test-'))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

// ── LubeLog copyFile: exact source-path resolution (strip leading slash, then
//    resolve within backupDir) ──────────────────────────────────────────────
function resolveLubelogSource(backupDir: string, sourcePath: string): string | null {
  const normalizedSource = sourcePath.replace(/^\//, '')
  return resolveWithinDir(backupDir, normalizedSource)
}

describe('import-lubelog copyFile source path', () => {
  it('reads a legitimate relative backup file', async () => {
    const backupDir = path.join(sandbox, 'backup')
    await mkdir(path.join(backupDir, 'images'), { recursive: true })
    await writeFile(path.join(backupDir, 'images', 'car.jpg'), 'REAL_IMAGE_BYTES')

    const resolved = resolveLubelogSource(backupDir, 'images/car.jpg')
    expect(resolved).not.toBeNull()
    expect(readFileSync(resolved!).toString()).toBe('REAL_IMAGE_BYTES')
  })

  it('reads a legitimate LubeLog-style leading-slash path (no regression)', async () => {
    const backupDir = path.join(sandbox, 'backup')
    await mkdir(path.join(backupDir, 'images'), { recursive: true })
    await writeFile(path.join(backupDir, 'images', 'car.jpg'), 'REAL_IMAGE_BYTES')

    // LubeLog stores locations like "/images/car.jpg"; the strip must keep it working.
    const resolved = resolveLubelogSource(backupDir, '/images/car.jpg')
    expect(resolved).toBe(path.join(backupDir, 'images', 'car.jpg'))
    expect(readFileSync(resolved!).toString()).toBe('REAL_IMAGE_BYTES')
  })

  it('blocks ../ traversal to a file outside the backup dir', async () => {
    const backupDir = path.join(sandbox, 'backup')
    await mkdir(backupDir, { recursive: true })
    await writeFile(path.join(sandbox, 'secret.txt'), 'TOP_SECRET')

    const resolved = resolveLubelogSource(backupDir, '../secret.txt')
    expect(resolved).toBeNull() // never reaches readFileSync
  })

  it('neutralizes an absolute system path instead of reading it', async () => {
    const backupDir = path.join(sandbox, 'backup')
    await mkdir(backupDir, { recursive: true })

    // After the leading-slash strip, "/etc/hostname" -> "etc/hostname",
    // which resolves *inside* backupDir (a non-existent file), never /etc/hostname.
    const resolved = resolveLubelogSource(backupDir, '/etc/hostname')
    expect(resolved).toBe(path.join(backupDir, 'etc', 'hostname'))
    expect(resolved!.startsWith(backupDir + path.sep)).toBe(true)
  })
})

// ── Invoice-Ninja document read: resolve doc.url within tmpDir/documents ─────
describe('import-invoice-ninja document path', () => {
  it('reads a legitimate document', async () => {
    const tmpDir = path.join(sandbox, 'in-import')
    await mkdir(path.join(tmpDir, 'documents'), { recursive: true })
    await writeFile(path.join(tmpDir, 'documents', 'abc.pdf'), 'PDF_BYTES')

    const resolved = resolveWithinDir(path.join(tmpDir, 'documents'), 'abc.pdf')
    expect(resolved).not.toBeNull()
    expect(readFileSync(resolved!).toString()).toBe('PDF_BYTES')
  })

  it('blocks ../ traversal out of the documents dir', async () => {
    const tmpDir = path.join(sandbox, 'in-import')
    await mkdir(path.join(tmpDir, 'documents'), { recursive: true })
    await writeFile(path.join(sandbox, 'secret.txt'), 'TOP_SECRET')

    const resolved = resolveWithinDir(path.join(tmpDir, 'documents'), '../../secret.txt')
    expect(resolved).toBeNull()
  })
})

// ── Zip-slip extraction: real JSZip archive through the guard ────────────────
describe('zip extraction guard (finding 1)', () => {
  async function extractGuarded(zip: JSZip, tmpDir: string) {
    const written: string[] = []
    const skipped: string[] = []
    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const targetPath = resolveWithinDir(tmpDir, relativePath)
      if (!targetPath) {
        skipped.push(relativePath)
        continue
      }
      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, await entry.async('nodebuffer'))
      written.push(targetPath)
    }
    return { written, skipped }
  }

  it('extracts legitimate entries and skips a zip-slip entry', async () => {
    const tmpDir = path.join(sandbox, 'extract')
    await mkdir(tmpDir, { recursive: true })

    const zip = new JSZip()
    zip.file('lubelog_db_backup/data/cartracker.db', 'DB_BYTES')
    zip.file('lubelog_db_backup/images/car.jpg', 'IMG_BYTES')
    zip.file('../evil.txt', 'PWNED') // zip-slip attempt

    const { written, skipped } = await extractGuarded(zip, tmpDir)

    // Legit files landed inside tmpDir
    expect(readFileSync(path.join(tmpDir, 'lubelog_db_backup/data/cartracker.db')).toString()).toBe(
      'DB_BYTES'
    )
    expect(readFileSync(path.join(tmpDir, 'lubelog_db_backup/images/car.jpg')).toString()).toBe(
      'IMG_BYTES'
    )
    expect(written).toHaveLength(2)

    // The malicious entry was skipped and never written outside tmpDir
    expect(skipped).toEqual(['../evil.txt'])
    await expect(stat(path.join(sandbox, 'evil.txt'))).rejects.toThrow()
  })
})
