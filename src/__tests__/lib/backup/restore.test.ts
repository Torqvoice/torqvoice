// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Restoring a snapshot from a backup destination, with restic and the
 * import mocked: restic "writes" the snapshot into the target folder the
 * engine asks for, and the import records what it was given. What is
 * checked is the glue: the run row, the lock, where the folder goes, how
 * the data file and the uploads folder are found, and that the folder is
 * removed however the run ends.
 *
 * The safety copy is the engine's real takeSafetySnapshot, not a stub: the
 * data writer is a fake and restic's init, unlock and backup are mocked, so
 * what is checked is that an actual snapshot of the workshop (tagged
 * pre-restore, with what the destination is set to keep) is asked of the
 * repository the restore reads from, before anything in the workshop is
 * replaced. A self-hosted install
 * has no platform repository, so that is where it goes here.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  runs: new Map<string, Row>(),
  connections: new Map<string, Row>(),
  seq: 0,
  /** What the fake restic restore writes under the target, as relative paths. */
  restoredTree: {} as Record<string, string>,
  /** The folder restic was asked to restore into, kept to look at later. */
  restoreTarget: null as string | null,
  /** Whether the restored files still existed when the import ran. */
  seenAtImport: null as { dataFile: boolean; filesDir: boolean | null; restoring: boolean } | null,
  importResult: { redactedSettings: ['ai.apiKey'] } as Row,
  importError: null as Error | null,
  log: vi.fn(async () => undefined),
  /** Where the fake destination keeps its repository: a folder under the test root. */
  repoDir: '',
  /** What happened, in order: the safety copy, restic's restore, the import. */
  events: [] as string[],
  /** Thrown by the fake restic backup, so the safety copy fails. */
  safetyError: null as Error | null,
  /** Every run's safetySnapshotId at the moment restic restored. */
  safetyAtRestore: null as (string | null)[] | null,
  owner: { userId: 'owner1' } as Row | null,
  /** The destination's backup settings. */
  settings: {} as Row,
}))

function merge(row: Row, data: Row): Row {
  const out = { ...row }
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v
  return out
}

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    backupRun: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const id = `run${++h.seq}`
        h.runs.set(id, {
          id,
          startedAt: null,
          finishedAt: null,
          snapshotId: null,
          filesNew: null,
          bytesAdded: null,
          totalBytes: null,
          error: null,
          createdAt: new Date(),
          ...data,
        })
        return { id }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = merge(h.runs.get(where.id) ?? {}, data)
        h.runs.set(where.id, row)
        return row
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => h.runs.get(where.id) ?? null
      ),
      // The busy check (organisation, kind, connection, open statuses) and
      // the queue's next run (status 'queued', oldest first).
      findFirst: vi.fn(async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        const statuses: string[] =
          typeof where.status === 'string' ? [where.status] : where.status.in
        const rows = [...h.runs.values()].filter(
          (r) =>
            statuses.includes(r.status) &&
            (where.organizationId === undefined || r.organizationId === where.organizationId) &&
            (where.kind === undefined || r.kind === where.kind) &&
            (where.connectionId === undefined || r.connectionId === where.connectionId)
        )
        if (orderBy) rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        return rows[0] ?? null
      }),
    },
    integrationConnection: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = h.connections.get(where.id)
        return row ? { ...row } : null
      }),
    },
    organizationMember: {
      findFirst: vi.fn(async () => h.owner),
      findMany: vi.fn(async () => [{ user: { email: 'owner@workshop.test' } }]),
    },
  }
  // The queue's transaction: the advisory lock is a no-op here, and the
  // transaction client is the same fake.
  db.$transaction = async (fn: (tx: Record<string, any>) => unknown) => fn(db)
  db.$executeRaw = vi.fn(async () => 0)
  return { db }
})

vi.mock('@/features/integrations/Lib/connections', () => ({
  loadConnection: vi.fn(async (id: string) => {
    const row = h.connections.get(id)
    if (!row) throw new Error('Integration connection not found')
    return {
      ctx: {
        connection: {
          id,
          organizationId: row.organizationId,
          connectorId: row.connectorId,
          settings: { ...h.settings },
          state: {},
        },
        credentials: { password: 'correct horse battery' },
        log: h.log,
        saveState: vi.fn(async () => undefined),
      },
      server: {
        backupTarget: { repository: async () => ({ repository: h.repoDir, env: {} }) },
      },
      status: row.status,
    }
  }),
  setConnectionStatus: vi.fn(async () => undefined),
}))

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) => ({ id, name: 'Test storage', capabilities: ['backup.target'] }),
  listManifests: () => [],
}))

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))

vi.mock('@/lib/backup/build-data', () => ({
  writeBackupData: vi.fn(
    async (organizationId: string, _options: Row, out: NodeJS.WritableStream) => {
      out.write(JSON.stringify({ organizationId }))
      return { datasets: ['customers'] }
    }
  ),
}))

vi.mock('@/lib/features', () => ({
  isCloudMode: () => false,
  getFeatures: vi.fn(async () => ({ platformBackups: false })),
}))
vi.mock('@/i18n/organization-translator', () => ({
  organizationTranslator: async () =>
    Object.assign((key: string) => key, { has: () => false, locale: 'en' }),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', () => ({
  getOrgFromAddress: vi.fn(async () => 'Workshop <post@workshop.test>'),
  sendOrgMail: vi.fn(async () => undefined),
}))

vi.mock('@/lib/backup/restic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backup/restic')>()
  return {
    ...actual,
    resticInit: vi.fn(async () => ({ created: false })),
    resticUnlock: vi.fn(async () => undefined),
    resticBackup: vi.fn(async () => {
      h.events.push('safety')
      if (h.safetyError) throw h.safetyError
      return {
        snapshotId: SAFETY,
        filesNew: 1,
        filesChanged: 0,
        dataAdded: 100,
        totalBytesProcessed: 100,
        totalFilesProcessed: 1,
        partial: false,
      }
    }),
    resticSnapshots: vi.fn(async () => []),
    resticRestoreSize: vi.fn(async () => 0),
    resticRestore: vi.fn(async (_opts: unknown, input: { snapshotId: string; target: string }) => {
      h.events.push('restore')
      h.safetyAtRestore = [...h.runs.values()].map((r) => r.safetySnapshotId ?? null)
      h.restoreTarget = input.target
      let bytes = 0
      for (const [rel, body] of Object.entries(h.restoredTree)) {
        const file = path.join(input.target, rel)
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, body)
        bytes += body.length
      }
      return { filesRestored: Object.keys(h.restoredTree).length, bytesRestored: bytes }
    }),
  }
})

// A data file the server would hold is tiny here, so the cap can be tripped
// without writing a hundred megabytes.
vi.mock('@/lib/backup/limits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/backup/limits')>()),
  MAX_DATA_FILE_BYTES: 1000,
}))

vi.mock('@/lib/backup/import', () => ({
  restoreFromDisk: vi.fn(
    async (_actor: unknown, input: { dataFile: string; filesDir: string | null }) => {
      const { isRestoring } = await import('@/lib/backup/freeze')
      h.events.push('import')
      h.seenAtImport = {
        dataFile: existsSync(input.dataFile),
        filesDir: input.filesDir === null ? null : existsSync(input.filesDir),
        restoring: isRestoring('org1'),
      }
      if (h.importError) throw h.importError
      return h.importResult
    }
  ),
}))

import { logAudit } from '@/lib/audit'
import { writeBackupData } from '@/lib/backup/build-data'
import { BackupBusyError } from '@/lib/backup/engine'
import { isRestoring } from '@/lib/backup/freeze'
import { restoreFromDisk } from '@/lib/backup/import'
import {
  resticBackup,
  resticRestore,
  resticRestoreSize,
  resticSnapshots,
} from '@/lib/backup/restic'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import {
  listSnapshots,
  locateRestored,
  queueRestore,
  restoreDirFor,
  runRestore,
} from '@/lib/backup/restore'

const ORG = 'org1'
const CONN = 'conn1'
const SNAPSHOT = '28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b'
const OLDER = '9d6cb16e448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b'
const SAFETY = '5a1e7c3b448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b'
const SAFETY_FAILED = 'Could not take a safety copy of the workshop first; nothing was changed.'

const root = mkdtempSync(path.join(tmpdir(), 'backup-restore-test-'))
const dataDir = path.join(root, 'data')
const savedEnv = { ...process.env }

/** A snapshot of the staged data file and the uploads folder, as the engine takes them. */
const FULL_TREE = {
  'tmp/torqvoice-backup-staging/org1/data.json': '{"version":2,"data":{}}',
  'srv/old-server/data/uploads/org1/logos/logo.png': 'png bytes',
  'srv/old-server/data/uploads/org1/service-files/a.pdf': 'pdf bytes',
}

function addConnection(): void {
  h.connections.set(CONN, {
    id: CONN,
    organizationId: ORG,
    connectorId: 'local-folder',
    status: 'active',
  })
}

function addRun(over: Row = {}): string {
  const id = `run${++h.seq}`
  h.runs.set(id, {
    id,
    organizationId: ORG,
    kind: 'destination',
    connectionId: CONN,
    trigger: 'restore',
    status: 'queued',
    requestedBy: 'user1',
    reason: null,
    startedAt: null,
    finishedAt: null,
    snapshotId: SNAPSHOT,
    safetySnapshotId: null,
    filesNew: null,
    bytesAdded: null,
    totalBytes: null,
    error: null,
    createdAt: new Date(),
    ...over,
  })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  h.runs.clear()
  h.connections.clear()
  h.seq = 0
  h.restoredTree = { ...FULL_TREE }
  h.restoreTarget = null
  h.seenAtImport = null
  h.importResult = { redactedSettings: ['ai.apiKey'] }
  h.importError = null
  h.events = []
  h.safetyError = null
  h.safetyAtRestore = null
  h.owner = { userId: 'owner1' }
  h.settings = {}
  h.repoDir = path.join(root, 'repo')
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  process.env.DATA_ROOT = dataDir
  ;(globalThis as Row).__torqvoiceBackupLock = null
  ;(globalThis as Row).__torqvoiceBackupDraining = false
  ;(globalThis as Row).__torqvoiceRestoring?.clear()
  addConnection()
})

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key]
  }
  Object.assign(process.env, savedEnv)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listSnapshots', () => {
  it('lists the snapshots newest first, with size and whether files were included', async () => {
    vi.mocked(resticSnapshots).mockResolvedValueOnce([
      {
        id: OLDER,
        shortId: '9d6cb16e',
        time: '2026-10-28T02:00:00+01:00',
        hostname: 'torqvoice-oldorg',
        tags: ['org:oldorg', 'scheduled'],
        paths: ['/tmp/torqvoice-backup-staging/oldorg'],
      },
      {
        id: 'probe000',
        shortId: 'probe000',
        time: '2026-10-30T00:00:00+01:00',
        hostname: 'torqvoice-probe-org1',
        tags: ['torqvoice-probe'],
        paths: ['/tmp/torqvoice-backup-probe-x'],
      },
      {
        id: SNAPSHOT,
        shortId: '28891c8f',
        time: '2026-10-29T09:09:10.44+01:00',
        hostname: 'torqvoice-org1',
        tags: ['org:org1', 'manual'],
        paths: ['/tmp/torqvoice-backup-staging/org1', '/srv/data/uploads/org1'],
        summary: {
          filesNew: 2,
          filesChanged: 0,
          dataAdded: 3851,
          totalFilesProcessed: 2,
          totalBytesProcessed: 4096,
        },
      },
    ])

    const list = await listSnapshots(CONN)

    expect(list).toEqual([
      {
        id: SNAPSHOT,
        shortId: '28891c8f',
        time: '2026-10-29T09:09:10.44+01:00',
        bytes: 4096,
        filesNew: 2,
        dataAdded: 3851,
        files: true,
        trigger: 'manual',
        thisWorkshop: true,
      },
      // An earlier install's snapshot in the same repository restores too;
      // the connection check's probe does not show.
      {
        id: OLDER,
        shortId: '9d6cb16e',
        time: '2026-10-28T02:00:00+01:00',
        bytes: null,
        filesNew: null,
        dataAdded: null,
        files: false,
        trigger: 'scheduled',
        thisWorkshop: false,
      },
    ])
    expect(vi.mocked(resticSnapshots).mock.calls[0][1]).toEqual({ tags: [] })
  })
})

describe('queueRestore', () => {
  it('makes a restore run that names the snapshot', async () => {
    const { runId } = await queueRestore(CONN, SNAPSHOT)
    expect(h.runs.get(runId)).toMatchObject({
      organizationId: ORG,
      kind: 'destination',
      connectionId: CONN,
      trigger: 'restore',
      status: 'queued',
      snapshotId: SNAPSHOT,
      requestedBy: null,
    })
  })

  it('takes a run target and keeps who asked and why', async () => {
    const { runId } = await queueRestore({ kind: 'destination', connectionId: CONN }, SNAPSHOT, {
      requestedBy: 'user1',
      reason: 'Put back yesterday',
    })
    expect(h.runs.get(runId)).toMatchObject({
      kind: 'destination',
      connectionId: CONN,
      trigger: 'restore',
      snapshotId: SNAPSHOT,
      requestedBy: 'user1',
      reason: 'Put back yesterday',
    })
  })

  it('refuses while a backup or restore is queued or running, and refuses a bad id', async () => {
    addRun({ trigger: 'manual', status: 'running' })
    await expect(queueRestore(CONN, SNAPSHOT)).rejects.toBeInstanceOf(BackupBusyError)
    await expect(queueRestore(CONN, 'latest')).rejects.toThrow(/snapshot id/)
  })
})

describe('runRestore', () => {
  it('restores into a folder under the data root, imports from it, and removes it', async () => {
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('done')
    expect(view.snapshotId).toBe(SNAPSHOT)
    expect(view.filesNew).toBe(3)
    expect(view.bytesAdded).toBe(
      Object.values(FULL_TREE).reduce((sum, body) => sum + body.length, 0)
    )
    expect(view.error).toBeNull()

    // Where restic was pointed: a folder of this run's own under the data root.
    expect(h.restoreTarget).toBe(restoreDirFor(ORG, runId))
    expect(h.restoreTarget?.startsWith(path.join(dataDir, 'restore-tmp'))).toBe(true)
    expect(vi.mocked(resticRestore).mock.calls[0][1]).toEqual({
      snapshotId: SNAPSHOT,
      target: h.restoreTarget,
    })

    // The data file and the uploads folder, found wherever the old server kept them.
    const target = h.restoreTarget as string
    expect(vi.mocked(restoreFromDisk).mock.calls[0][0]).toEqual({
      organizationId: ORG,
      userId: 'user1',
    })
    expect(vi.mocked(restoreFromDisk).mock.calls[0][1]).toEqual({
      dataFile: path.join(target, 'tmp/torqvoice-backup-staging/org1/data.json'),
      filesDir: path.join(target, 'srv/old-server/data/uploads/org1'),
    })
    expect(h.seenAtImport).toEqual({ dataFile: true, filesDir: true, restoring: true })

    // Gone afterwards, and the lock is free again.
    expect(existsSync(target)).toBe(false)
    expect((globalThis as Row).__torqvoiceBackupLock).toBeNull()

    // The audit row is written after the import, which replaced the old log.
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logAudit).mock.calls[0][0]).toEqual({ userId: 'user1', organizationId: ORG })
    expect(vi.mocked(logAudit).mock.calls[0][1]).toMatchObject({
      action: 'integration.backup_restore',
      entity: 'BackupRun',
      entityId: runId,
      details: { key: 'backup_restored', params: { name: 'Test storage', snapshot: '28891c8f' } },
      metadata: { redactedSettings: ['ai.apiKey'] },
    })
    expect(h.log).toHaveBeenCalledWith('info', 'Backup restored', expect.any(Object))
  })

  it('restores a data-only snapshot with no uploads folder', async () => {
    h.restoredTree = {
      'tmp/torqvoice-backup-staging/org1/data.json': '{"version":2,"data":{}}',
    }
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('done')
    expect(vi.mocked(restoreFromDisk).mock.calls[0][1].filesDir).toBeNull()
  })

  it('fails the run, keeps the message and removes the folder when the import throws', async () => {
    h.importError = new Error('Could not restore customers: boom')
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toBe('Could not restore customers: boom')
    expect(existsSync(h.restoreTarget as string)).toBe(false)
    expect((globalThis as Row).__torqvoiceBackupLock).toBeNull()
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('fails when the snapshot holds no data.json', async () => {
    h.restoredTree = { 'srv/data/uploads/org1/logos/logo.png': 'png' }
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toBe('The snapshot holds no data.json Nothing in the workshop was changed.')
    expect(restoreFromDisk).not.toHaveBeenCalled()
    expect(existsSync(h.restoreTarget as string)).toBe(false)
  })

  it('refuses a snapshot the data disk cannot take, before restic writes a byte of it', async () => {
    vi.mocked(resticRestoreSize).mockResolvedValueOnce(Number.MAX_SAFE_INTEGER)
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/free; a restore keeps/)
    expect(view.error).toMatch(/Nothing in the workshop was changed\.$/)
    expect(vi.mocked(resticRestoreSize).mock.calls[0][1]).toBe(SNAPSHOT)
    expect(resticRestore).not.toHaveBeenCalled()
    expect(restoreFromDisk).not.toHaveBeenCalled()
    expect(isRestoring(ORG)).toBe(false)
  })

  it('refuses a data file larger than the server reads into memory, and removes the folder', async () => {
    h.restoredTree['tmp/torqvoice-backup-staging/org1/data.json'] =
      `{"version":2,"padding":"${'x'.repeat(1200)}","data":{}}`
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/more than this server reads into memory/)
    expect(view.error).toMatch(/Nothing in the workshop was changed\.$/)
    expect(restoreFromDisk).not.toHaveBeenCalled()
    expect(existsSync(h.restoreTarget as string)).toBe(false)
    expect(isRestoring(ORG)).toBe(false)
  })

  it('says why when restic refuses', async () => {
    const { ResticError } = await import('@/lib/backup/restic')
    vi.mocked(resticRestore).mockRejectedValueOnce(
      new ResticError({
        message: 'Fatal: wrong password or no key found',
        code: 12,
        stderr: '',
        command: 'restic restore',
        reason: 'wrong_password',
      })
    )
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/different password/)
    expect(restoreFromDisk).not.toHaveBeenCalled()
  })

  it('stays queued while a backup holds the lock', async () => {
    ;(globalThis as Row).__torqvoiceBackupLock = { runId: 'other', since: Date.now() }
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('queued')
    expect(view.error).toBeNull()
    expect(h.runs.get(runId)).toMatchObject({ status: 'queued', startedAt: null })
    expect(resticBackup).not.toHaveBeenCalled()
    expect(resticRestore).not.toHaveBeenCalled()
    expect(isRestoring(ORG)).toBe(false)
    // Somebody else's lock is left alone.
    expect((globalThis as Row).__torqvoiceBackupLock).toEqual({
      runId: 'other',
      since: expect.any(Number),
    })
  })

  it('takes a safety copy of the workshop before restic restores, and keeps its id on the row', async () => {
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('done')
    expect(view.safetySnapshotId).toBe(SAFETY)
    expect(h.runs.get(runId)?.safetySnapshotId).toBe(SAFETY)
    expect(h.events).toEqual(['safety', 'restore', 'import'])
    // The id was on the row before restic restored anything.
    expect(h.safetyAtRestore).toEqual([SAFETY])
    // A snapshot of this workshop into the restore's own repository, with
    // the secret keys in it even though the destination keeps data only.
    expect(vi.mocked(writeBackupData).mock.calls[0][0]).toBe(ORG)
    expect(vi.mocked(writeBackupData).mock.calls[0][1]).toMatchObject({ includeSecrets: true })
    const [opts, input] = vi.mocked(resticBackup).mock.calls[0]
    expect(opts.repository.repository).toBe(h.repoDir)
    expect(input).toMatchObject({ host: `torqvoice-${ORG}` })
    expect(input.tags).toEqual([`org:${ORG}`, 'pre-restore'])
    expect(vi.mocked(logAudit).mock.calls[0][1]).toMatchObject({
      metadata: { safetySnapshotId: SAFETY, bySupport: false },
    })
  })

  it('keeps the secret keys in the safety copy whatever the destination is set to keep', async () => {
    h.settings = { contents: 'data' }
    await runRestore(addRun())
    expect(vi.mocked(writeBackupData).mock.calls[0][1]).toMatchObject({ includeSecrets: true })
  })

  it('leaves the workshop untouched when the safety copy cannot be taken', async () => {
    h.safetyError = new Error('bucket gone')
    const runId = addRun()

    const view = await runRestore(runId)

    expect(view.status).toBe('failed')
    expect(view.error?.startsWith(SAFETY_FAILED)).toBe(true)
    expect(view.error).toContain('bucket gone')
    expect(view.safetySnapshotId).toBeNull()
    expect(resticRestore).not.toHaveBeenCalled()
    expect(restoreFromDisk).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(isRestoring(ORG)).toBe(false)
    expect((globalThis as Row).__torqvoiceBackupLock).toBeNull()
  })

  it('freezes the workshop while the restore runs and unfreezes it after', async () => {
    expect(isRestoring(ORG)).toBe(false)
    await runRestore(addRun())
    expect(h.seenAtImport?.restoring).toBe(true)
    expect(isRestoring(ORG)).toBe(false)
  })

  it('unfreezes the workshop after a failed restore too', async () => {
    h.importError = new Error('Could not restore customers: boom')
    const view = await runRestore(addRun())
    expect(view.status).toBe('failed')
    expect(h.seenAtImport?.restoring).toBe(true)
    expect(isRestoring(ORG)).toBe(false)
  })

  it("writes a restore support started in the name of the workshop's first owner", async () => {
    const runId = addRun({ requestedBy: null, reason: 'Customer asked by phone' })

    const view = await runRestore(runId)

    expect(view.status).toBe('done')
    expect(vi.mocked(db.organizationMember.findFirst).mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG, role: 'owner' },
    })
    expect(vi.mocked(restoreFromDisk).mock.calls[0][0]).toEqual({
      organizationId: ORG,
      userId: 'owner1',
    })
    expect(vi.mocked(logAudit).mock.calls[0][0]).toEqual({ userId: 'owner1', organizationId: ORG })
    expect(vi.mocked(logAudit).mock.calls[0][1]).toMatchObject({
      metadata: { bySupport: true, reason: 'Customer asked by phone' },
    })
    // The workshop hears that support put it back, and why.
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, type: 'backup_restored' })
    )
    expect(vi.mocked(notify).mock.calls[0][0].message).toContain('backupAlerts.restoredBySupport')
  })

  it("a member's restore is written in that member's name, without looking up the owner", async () => {
    await runRestore(addRun({ requestedBy: 'user1' }))
    expect(db.organizationMember.findFirst).not.toHaveBeenCalled()
    expect(vi.mocked(restoreFromDisk).mock.calls[0][0]).toEqual({
      organizationId: ORG,
      userId: 'user1',
    })
  })

  it('fails a support restore of a workshop with no owner before anything is changed', async () => {
    h.owner = null
    const view = await runRestore(addRun({ requestedBy: null }))
    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/no owner/)
    expect(resticBackup).not.toHaveBeenCalled()
    expect(restoreFromDisk).not.toHaveBeenCalled()
  })

  it('refuses a run that is not a restore, and leaves a finished one alone', async () => {
    const backup = addRun({ trigger: 'manual', snapshotId: null })
    expect((await runRestore(backup)).status).toBe('failed')
    const done = addRun({ status: 'done' })
    expect((await runRestore(done)).status).toBe('done')
    expect(resticRestore).not.toHaveBeenCalled()
  })
})

describe('locateRestored', () => {
  it('finds data.json and the uploads folder named after the workshop', async () => {
    const dir = path.join(root, 'locate')
    rmSync(dir, { recursive: true, force: true })
    for (const [rel, body] of Object.entries(FULL_TREE)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      writeFileSync(path.join(dir, rel), body)
    }
    // Another workshop's folder on the same old server is not ours.
    mkdirSync(path.join(dir, 'srv/old-server/data/uploads/org2/logos'), { recursive: true })

    expect(await locateRestored(dir, ORG)).toEqual({
      dataFile: path.join(dir, 'tmp/torqvoice-backup-staging/org1/data.json'),
      filesDir: path.join(dir, 'srv/old-server/data/uploads/org1'),
    })
    // A snapshot an earlier install took has its uploads under the old id.
    expect(await locateRestored(dir, 'org3')).toEqual({
      dataFile: path.join(dir, 'tmp/torqvoice-backup-staging/org1/data.json'),
      filesDir: path.join(dir, 'srv/old-server/data/uploads/org1'),
    })
    expect(
      readFileSync(path.join(dir, 'tmp/torqvoice-backup-staging/org1/data.json'), 'utf8')
    ).toBe('{"version":2,"data":{}}')
  })

  it('names the restore folder after the workshop and the run, under the data root', () => {
    expect(restoreDirFor(ORG, 'run1')).toBe(path.join(dataDir, 'restore-tmp', 'org1-run1'))
    expect(() => restoreDirFor('../x', 'run1')).toThrow()
  })
})
