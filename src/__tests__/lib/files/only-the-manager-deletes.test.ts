/**
 * @vitest-environment node
 *
 * Every uploaded file is deleted by the file manager (lib/files/manager.ts)
 * and by nothing else, because the manager is where the rules live: after the
 * database change, only if no row still uses the file, only inside the
 * workshop's own folder. A direct `unlink` anywhere else is how files were
 * deleted from under rows that still needed them (a tire set's photos, the
 * company logo) and how another workshop's files could be reached.
 *
 * This walks `src/` and fails on any file-deleting call outside the manager,
 * except in the few places that only ever work in the system temp folder.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MANAGER = 'src/lib/files/manager.ts'

/**
 * Deletes that never touch the uploads folder: what each may delete (every
 * delete call in the file has to name one of these), why, and the folder it
 * works under when that is not os.tmpdir().
 */
const TEMP_FOLDER_ONLY: Record<string, { targets: RegExp; why: string; under?: string }> = {
  'src/features/import/Lib/staging.ts': {
    targets: /\brm\((?:p|fileFor\()/,
    why: 'spreadsheet imports staged under os.tmpdir()',
  },
  'src/app/api/protected/backup/import-lubelog/route.ts': {
    targets: /\brm\(tmpDir\b/,
    why: 'its own extract folder under os.tmpdir()',
  },
  'src/app/api/protected/backup/import-invoice-ninja/route.ts': {
    targets: /\brm\(tmpDir\b/,
    why: 'its own extract folder under os.tmpdir()',
  },
  'src/lib/backup/engine.ts': {
    targets: /\brm\(dataFile\b/,
    why: 'the data.json it staged for restic, under its own backup-staging folder',
  },
  'src/lib/backup/target.ts': {
    targets: /\brm\((?:probe\b|cacheDirFor\()/,
    why: "a probe folder under os.tmpdir(), and restic's own cache folder",
  },
  'src/lib/backup/restore.ts': {
    targets: /\brm\(folder\b/,
    why: 'the folder restic wrote a snapshot into, under restore-tmp in the data root',
    under: 'restoreDirFor(',
  },
  'src/lib/backup/explore.ts': {
    targets: /\brm\((?:point\.dir|dir|dataFile)\b/,
    why: 'the folder a restore point is opened into (and the data file pulled into it, once parsed), under restore-explore in the data root',
    under: 'exploreDirFor(',
  },
  'src/lib/backup/restic.ts': {
    targets: /\brm\(input\.target\b/,
    why: 'the file it was writing a snapshot entry into when restic failed, so a half file is never served',
    under: 'createWriteStream(input.target',
  },
  'src/lib/backup/zip-file.ts': {
    targets: /\brm\(dir\b/,
    why: 'the folder an uploaded zip is spooled into under os.tmpdir()',
  },
  'src/integrations/local-folder/server.ts': {
    targets: /\brm\(probe\b/,
    why: "its own probe file under the workshop's local backup folder",
    under: 'localRepositoryPath(',
  },
}

const DELETE_CALL = /\b(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync)\s*\(/

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'generated' ? [] : sourceFiles(full)
    }
    return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [full] : []
  })
}

describe('deleting uploaded files', () => {
  const files = sourceFiles('src')

  it('happens only in the file manager', () => {
    const offenders = files
      .filter((file) => file !== MANAGER && !(file in TEMP_FOLDER_ONLY))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
          .filter(({ text }) => !text.startsWith('//') && !text.startsWith('*'))
          .filter(({ text }) => DELETE_CALL.test(text))
      )
      .map(({ file, line, text }) => `${file}:${line}  ${text}`)
    expect(offenders, 'Delete uploads through releaseFiles in lib/files/manager.ts').toEqual([])
  })

  it('in the temp-folder exceptions, deletes only their own temp files', () => {
    for (const [file, { targets, under = 'os.tmpdir()' }] of Object.entries(TEMP_FOLDER_ONLY)) {
      const source = fs.readFileSync(file, 'utf8')
      expect(source, `${file} works under ${under}`).toContain(under)
      const calls = source.split('\n').filter((line) => DELETE_CALL.test(line))
      expect(calls.length, `${file} still deletes something`).toBeGreaterThan(0)
      for (const call of calls) expect(call.trim(), file).toMatch(targets)
    }
  })

  it('is what the manager itself does', () => {
    expect(fs.readFileSync(MANAGER, 'utf8')).toMatch(DELETE_CALL)
  })
})
