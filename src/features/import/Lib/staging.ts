/**
 * Where an uploaded spreadsheet waits between steps.
 *
 * The wizard uploads once, then maps, dry-runs and commits against the same
 * parsed rows. Keeping them in a temp file keyed by a random token means the
 * later steps are plain server actions that carry a token instead of the
 * file, and a page refresh mid-wizard loses nothing. Files older than two
 * hours are swept on the next write; nothing here is durable by design.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveWithinDir } from '@/lib/safe-path'
import type { ImportEntity } from './fields'
import type { ParsedSheet } from './parse'

const ROOT = path.join(os.tmpdir(), 'torqvoice-import')
const TTL_MS = 2 * 60 * 60 * 1000
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface StagedImport {
  token: string
  organizationId: string
  fileName: string
  entity: ImportEntity
  presetId: string | null
  sheet: ParsedSheet
  createdAt: string
}

export interface ImportProgress {
  phase: 'writing' | 'done' | 'failed'
  done: number
  total: number
  batchId?: string
  error?: string
}

function orgDir(organizationId: string): string {
  // Organisation ids are cuids; anything else is refused before it touches a path.
  if (!/^[a-z0-9]+$/i.test(organizationId)) throw new Error('Invalid organisation id')
  return path.join(ROOT, organizationId)
}

function fileFor(organizationId: string, token: string, suffix = '.json'): string {
  if (!TOKEN.test(token)) throw new Error('Invalid import token')
  const resolved = resolveWithinDir(orgDir(organizationId), `${token}${suffix}`)
  if (!resolved) throw new Error('Invalid import token')
  return resolved
}

async function sweep(dir: string): Promise<void> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  const cutoff = Date.now() - TTL_MS
  await Promise.all(
    names.map(async (name) => {
      const p = path.join(dir, name)
      try {
        const s = await stat(p)
        if (s.mtimeMs < cutoff) await rm(p, { force: true })
      } catch {
        // Already gone.
      }
    })
  )
}

export async function stageImport(
  input: Omit<StagedImport, 'token' | 'createdAt'>
): Promise<StagedImport> {
  const dir = orgDir(input.organizationId)
  await mkdir(dir, { recursive: true })
  await sweep(dir)
  const staged: StagedImport = {
    ...input,
    token: randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await writeFile(fileFor(input.organizationId, staged.token), JSON.stringify(staged), 'utf-8')
  return staged
}

export async function readStagedImport(
  organizationId: string,
  token: string
): Promise<StagedImport | null> {
  try {
    const raw = await readFile(fileFor(organizationId, token), 'utf-8')
    const staged = JSON.parse(raw) as StagedImport
    if (staged.organizationId !== organizationId) return null
    return staged
  } catch {
    return null
  }
}

export async function discardStagedImport(organizationId: string, token: string): Promise<void> {
  await rm(fileFor(organizationId, token), { force: true })
  await rm(fileFor(organizationId, token, '.progress.json'), { force: true })
}

export async function writeImportProgress(
  organizationId: string,
  token: string,
  progress: ImportProgress
): Promise<void> {
  await writeFile(
    fileFor(organizationId, token, '.progress.json'),
    JSON.stringify(progress),
    'utf-8'
  )
}

export async function readImportProgress(
  organizationId: string,
  token: string
): Promise<ImportProgress | null> {
  try {
    const raw = await readFile(fileFor(organizationId, token, '.progress.json'), 'utf-8')
    return JSON.parse(raw) as ImportProgress
  } catch {
    return null
  }
}
