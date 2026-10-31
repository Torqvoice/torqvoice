/**
 * @vitest-environment node
 *
 * A backup restic wrote out is a data.json and an uploads folder on disk.
 * It goes through the same restore as the uploaded zip: the rows are
 * replaced, then the files are moved into the workshop's uploads folder and
 * the ones the backup did not bring back go through the file manager.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const root = mkdtempSync(path.join(tmpdir(), 'import-from-disk-'))
const uploads = path.join(root, 'uploads')

const state = vi.hoisted(() => ({
  calls: [] as { model: string; method: string; args: any }[],
}))

vi.mock('@/lib/db', () => {
  const tx = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_t, method: string) => async (args: any) => {
              state.calls.push({ model, method, args })
              if (method === 'findMany') return []
              if (method === 'findFirst' || method === 'findUnique') return null
              return { count: 0 }
            },
          }
        ),
    }
  )
  return { db: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } }
})
vi.mock('@/lib/files/manager', () => ({ releaseFilesNotRestored: vi.fn(async () => undefined) }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => uploads }))

import { releaseFilesNotRestored } from '@/lib/files/manager'
import { directoryFileSource, restoreFromDisk } from '@/lib/backup/import'

const actor = { organizationId: 'org1', userId: 'user1' }

function writeBackup(dir: string, backup: unknown, files: Record<string, string> = {}) {
  mkdirSync(path.join(dir, 'stage'), { recursive: true })
  writeFileSync(path.join(dir, 'stage', 'data.json'), JSON.stringify(backup))
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, 'files', name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
}

beforeEach(() => {
  state.calls = []
  vi.clearAllMocks()
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('restoreFromDisk', () => {
  it('replaces the rows and moves the files into the uploads folder', async () => {
    const dir = path.join(root, 'restored')
    writeBackup(
      dir,
      { version: 2, data: { settings: [{ id: 's1', key: 'workshop.phone', value: '+47 1' }] } },
      {
        'logos/logo.png': 'png bytes',
        'logos/notes.txt': 'kept out of no category',
        'not-a-category/x.bin': 'ignored',
      }
    )
    mkdirSync(path.join(uploads, 'org1', 'logos'), { recursive: true })
    writeFileSync(path.join(uploads, 'org1', 'logos', 'old.png'), 'old')

    const result = await restoreFromDisk(actor, {
      dataFile: path.join(dir, 'stage', 'data.json'),
      filesDir: path.join(dir, 'files'),
    })

    expect(result).toEqual({ redactedSettings: [] })
    const created = state.calls.find((c) => c.model === 'appSetting' && c.method === 'createMany')
    expect(created?.args.data).toEqual([
      { id: 's1', key: 'workshop.phone', value: '+47 1', userId: 'user1', organizationId: 'org1' },
    ])
    expect(readFileSync(path.join(uploads, 'org1', 'logos', 'logo.png'), 'utf8')).toBe('png bytes')
    expect(readFileSync(path.join(uploads, 'org1', 'logos', 'notes.txt'), 'utf8')).toBe(
      'kept out of no category'
    )
    expect(existsSync(path.join(uploads, 'org1', 'not-a-category'))).toBe(false)
    // The file manager decides about what the backup did not bring back.
    expect(existsSync(path.join(uploads, 'org1', 'logos', 'old.png'))).toBe(true)
    expect(releaseFilesNotRestored).toHaveBeenCalledTimes(1)
    expect(vi.mocked(releaseFilesNotRestored).mock.calls[0][0]).toBe('org1')
    expect(vi.mocked(releaseFilesNotRestored).mock.calls[0][1]).toBe('logos')
    expect([...vi.mocked(releaseFilesNotRestored).mock.calls[0][2]].sort()).toEqual([
      'logo.png',
      'notes.txt',
    ])
  })

  it('restores a data-only snapshot without touching the uploads folder', async () => {
    const dir = path.join(root, 'restored')
    writeBackup(dir, { version: 2, data: { customers: [] } })

    await restoreFromDisk(actor, { dataFile: path.join(dir, 'stage', 'data.json'), filesDir: null })

    expect(existsSync(path.join(uploads, 'org1'))).toBe(false)
    expect(releaseFilesNotRestored).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a backup before any row is touched', async () => {
    const dir = path.join(root, 'restored')
    writeBackup(dir, { version: 3, data: {} })
    await expect(
      restoreFromDisk(actor, { dataFile: path.join(dir, 'stage', 'data.json'), filesDir: null })
    ).rejects.toThrow('Unsupported or missing backup version')
    writeBackup(dir, { version: 2 })
    await expect(
      restoreFromDisk(actor, { dataFile: path.join(dir, 'stage', 'data.json'), filesDir: null })
    ).rejects.toThrow('No data found in backup')
    expect(state.calls).toEqual([])
  })

  it('lists one entry per file inside a category folder', async () => {
    const dir = path.join(root, 'files')
    mkdirSync(path.join(dir, 'logos', 'nested'), { recursive: true })
    mkdirSync(path.join(dir, 'service-files'), { recursive: true })
    writeFileSync(path.join(dir, 'logos', 'a.png'), 'a')
    writeFileSync(path.join(dir, 'service-files', 'b.pdf'), 'b')
    writeFileSync(path.join(dir, 'loose.txt'), 'not in a category')

    const source = await directoryFileSource(dir)
    expect(source.entries.map((e) => `${e.category}/${e.name}`).sort()).toEqual([
      'logos/a.png',
      'service-files/b.pdf',
    ])

    const target = path.join(root, 'out', 'deep', 'b.pdf')
    await source.extract({ category: 'service-files', name: 'b.pdf' }, target)
    expect(readFileSync(target, 'utf8')).toBe('b')
  })
})
