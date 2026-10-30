import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import { dataRoot } from '@/lib/upload-root'
import {
  ResticError,
  resticBackup,
  resticForgetSnapshot,
  resticInit,
  resticOpen,
  resticUnlock,
} from './restic'

/**
 * The pieces a destination connector and the engine share: where the restic
 * cache lives, what may reach the restic child from a connector, and the
 * connect-time check that proves a destination can take a backup.
 */

/** restic's cache for one workshop: encrypted index data only, safe to delete. */
export function cacheDirFor(organizationId: string): string {
  if (!/^[a-z0-9]+$/i.test(organizationId)) throw new Error('Unexpected organisation id')
  return path.join(dataRoot(), 'restic-cache', organizationId)
}

export async function ensureCacheDir(organizationId: string): Promise<string> {
  const dir = cacheDirFor(organizationId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}

export async function forgetRepositoryCache(organizationId: string): Promise<void> {
  await rm(cacheDirFor(organizationId), { recursive: true, force: true })
}

/** The env a connector may not set: the runner owns these. */
const RESERVED_ENV = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'GOGC',
  'RESTIC_PASSWORD',
  'RESTIC_PASSWORD_FILE',
  'RESTIC_PASSWORD_COMMAND',
  'RESTIC_REPOSITORY',
  'RESTIC_REPOSITORY_FILE',
  'RESTIC_CACHE_DIR',
])

/**
 * A connector's repository description with anything the runner must own
 * taken out, and every env name checked. A connector is our own code, but
 * the check costs nothing and keeps a later connector from quietly pointing
 * restic somewhere else.
 */
export function sanitizeRepository(repo: ResticRepository): ResticRepository {
  if (typeof repo.repository !== 'string' || !repo.repository.trim()) {
    throw new Error('The destination gave no repository address')
  }
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(repo.env ?? {})) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || RESERVED_ENV.has(key)) continue
    if (typeof value !== 'string') continue
    env[key] = value
  }
  const options: Record<string, string> = {}
  for (const [key, value] of Object.entries(repo.options ?? {})) {
    if (!/^[a-z0-9.-]{1,40}$/.test(key) || typeof value !== 'string') continue
    options[key] = value
  }
  return { repository: repo.repository.trim(), env, options }
}

/** The repository address without anything secret, for logs and the account label. */
export function describeRepository(repo: ResticRepository): string {
  try {
    if (repo.repository.startsWith('s3:')) {
      const url = new URL(repo.repository.slice(3))
      url.username = ''
      url.password = ''
      url.search = ''
      return `s3:${url.toString()}`
    }
  } catch {
    // Not a URL: a local path, which carries no secret.
  }
  return repo.repository
}

/** Repository password from the sealed credentials, or a clear error. */
export function repositoryPassword(ctx: ConnectorContext): string {
  const password = ctx.credentials.password
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('The backup password must be at least 8 characters.')
  }
  return password
}

/**
 * The connect-time check. Opens the repository, creating it when the bucket
 * or folder is empty, then writes one tiny snapshot and forgets it again.
 * That proves what a backup needs: the keys can write, read and delete, and
 * the password opens what is there.
 */
export async function testBackupTarget(
  ctx: ConnectorContext,
  repository: (ctx: ConnectorContext) => Promise<ResticRepository>
): Promise<{ ok: boolean; message?: string }> {
  let repo: ResticRepository
  let password: string
  try {
    repo = sanitizeRepository(await repository(ctx))
    password = repositoryPassword(ctx)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Invalid settings' }
  }
  const cacheDir = await ensureCacheDir(ctx.connection.organizationId)
  const base = { repository: repo, password, cacheDir }
  const probe = await mkdtemp(path.join(os.tmpdir(), 'torqvoice-backup-probe-'))
  try {
    if (!repo.repository.startsWith('s3:')) {
      await mkdir(repo.repository, { recursive: true })
    }
    await resticInit(base)
    await resticOpen(base)
    await resticUnlock(base)
    await writeFile(path.join(probe, 'probe.txt'), `torqvoice connection check ${Date.now()}\n`)
    const result = await resticBackup(base, {
      paths: [probe],
      host: `torqvoice-probe-${ctx.connection.organizationId}`,
      tags: ['torqvoice-probe'],
    })
    await resticForgetSnapshot(base, result.snapshotId)
    await ctx.log('info', 'Backup destination checked', {
      repository: describeRepository(repo),
    })
    return { ok: true }
  } catch (err) {
    const message = connectMessage(err)
    await ctx.log('error', 'Backup destination check failed', { error: message })
    return { ok: false, message }
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}

/** What the connect page should say for a failed check. */
export function connectMessage(err: unknown): string {
  if (err instanceof ResticError) {
    if (err.reason === 'wrong_password') {
      return 'This storage already holds a Torqvoice backup with a different password. Enter the password it was created with, or choose another folder.'
    }
    if (err.reason === 'no_repository') {
      return 'No repository found at this address.'
    }
    const stderr = err.stderr.trim().split('\n').filter(Boolean).pop() ?? ''
    return stderr ? `Storage refused the request: ${stderr.slice(0, 300)}` : err.message
  }
  return err instanceof Error ? err.message : 'Connection check failed'
}
