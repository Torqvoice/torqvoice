// @vitest-environment node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The engine end to end against a fake restic: a shell script that records
 * each call (argv, env, the staged data file) and answers with restic 0.19.1
 * JSON. The database, connection loader, data writer, mail and notifications
 * are in-memory fakes.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  runs: new Map<string, Row>(),
  connections: new Map<string, Row>(),
  members: [] as Row[],
  /** PlatformBackup rows by organisation id. */
  platform: new Map<string, Row>(),
  cloud: false,
  features: { platformBackups: false } as Record<string, boolean>,
  seq: 0,
  server: null as any,
  password: 'correct horse battery',
}))

/** Prisma leaves a field alone when the value is undefined. */
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
      // Both reads: the busy check (organisation, kind, connection, open
      // statuses) and the queue's next run (status 'queued', oldest first).
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
    platformBackup: {
      upsert: vi.fn(
        async ({ where, create }: { where: { organizationId: string }; create: Row }) => {
          const row = h.platform.get(where.organizationId) ?? {
            lastPruneAt: null,
            lastCheckAt: null,
            ...create,
          }
          h.platform.set(where.organizationId, row)
          return row
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { organizationId: string }; data: Row }) => {
        const row = merge(h.platform.get(where.organizationId) ?? {}, data)
        h.platform.set(where.organizationId, row)
        return row
      }),
    },
    integrationConnection: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = h.connections.get(where.id)
        return row ? { ...row, state: { ...row.state } } : null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = merge(h.connections.get(where.id) ?? {}, data)
        h.connections.set(where.id, row)
        return row
      }),
    },
    organizationMember: { findMany: vi.fn(async () => h.members) },
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
    const ctx = {
      connection: {
        id,
        organizationId: row.organizationId,
        connectorId: row.connectorId,
        settings: { ...row.settings },
        state: { ...row.state },
        externalAccountId: null,
      },
      credentials: { password: h.password },
      log: vi.fn(async () => undefined),
      async saveState(patch: Row) {
        const current = h.connections.get(id) as Row
        current.state = { ...current.state, ...patch }
        ctx.connection.state = current.state
      },
    }
    return { ctx, server: h.server, status: row.status }
  }),
  setConnectionStatus: vi.fn(async (id: string, status: string, error?: string | null) => {
    const row = h.connections.get(id)
    if (!row) return
    row.status = status
    if (error !== undefined) row.lastError = error
    if (status === 'active') row.lastError = null
  }),
}))

vi.mock('@/lib/backup/build-data', () => ({
  writeBackupData: vi.fn(
    async (organizationId: string, options: Row, out: NodeJS.WritableStream) => {
      out.write(
        JSON.stringify({ organizationId, includeSecrets: options.includeSecrets, at: h.seq })
      )
      return { datasets: ['customers'] }
    }
  ),
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

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) =>
    id === 'not-backup'
      ? { id, name: 'Calendar', capabilities: ['calendar.sync'] }
      : { id, name: 'Test storage', capabilities: ['backup.target'] },
  listManifests: () => [],
}))

vi.mock('@/lib/features', () => ({
  isCloudMode: () => h.cloud,
  getFeatures: vi.fn(async () => h.features),
}))

import { writeBackupData } from '@/lib/backup/build-data'
import {
  BackupBusyError,
  backupLockHolder,
  drainBackupQueue,
  openPlatform,
  openTarget,
  queueBackupRun,
  runBackup,
  stagingDirFor,
  takeSafetySnapshot,
} from '@/lib/backup/engine'
import { platformRepositoryPassword } from '@/lib/backup/platform'
import { resticSnapshots } from '@/lib/backup/restic'
import { loadConnection, setConnectionStatus } from '@/features/integrations/Lib/connections'
import { sendOrgMail } from '@/lib/email'
import { notify } from '@/lib/notify'
import { connector as localFolder } from '@/integrations/local-folder/server'

// Lines below are copied from restic 0.19.1 `--json` output (see restic.test.ts).
const SNAPSHOT_ID = '28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b'
const SUMMARY_LINE = `{"message_type":"summary","files_new":2,"files_changed":0,"files_unmodified":0,"dirs_new":8,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":2,"tree_blobs":9,"data_added":3851,"data_added_packed":2966,"total_files_processed":2,"total_bytes_processed":12,"total_duration":0.716071765,"backup_start":"2026-10-29T09:09:10.444930802+01:00","backup_end":"2026-10-29T09:09:11.161002555+01:00","snapshot_id":"${SNAPSHOT_ID}"}`
const STATUS_LINE =
  '{"message_type":"status","seconds_elapsed":1,"percent_done":0.684350835,"total_files":1,"total_bytes":400000000,"bytes_done":273740334,"current_files":["/data/blob"]}'
const INIT_LINE = '{"message_type":"initialized","id":"7f2a","repository":"/repo"}'
const STATS_LINE =
  '{"total_size":6928,"total_uncompressed_size":11714,"compression_ratio":1.6908198614318706,"compression_progress":100,"compression_space_saving":40.85709407546525,"total_blob_count":29,"snapshots_count":3}'
const FORGET_LINE =
  '[{"tags":["org:org1"],"host":"torqvoice-org1","paths":null,"keep":[{"id":"9284","short_id":"92846caf"}],"remove":null,"reasons":[]}]'
const CHECK_LINE =
  '{"message_type":"summary","num_errors":0,"broken_packs":null,"suggest_repair_index":false,"suggest_prune":false}'
const SAFETY_ID = '9d6cb16e448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b'
const SNAPSHOTS_LINE = `[{"time":"2026-10-29T09:09:10.44+01:00","tree":"ab12","paths":["/tmp/torqvoice-backup-staging/org1"],"hostname":"torqvoice-org1","tags":["org:org1","scheduled","platform"],"id":"${SNAPSHOT_ID}","short_id":"28891c8f"},{"time":"2026-10-28T09:00:00+01:00","tree":"cd34","paths":["/tmp/torqvoice-backup-staging/org1"],"hostname":"torqvoice-org1","tags":["org:org1","pre-restore","platform"],"id":"${SAFETY_ID}","short_id":"9d6cb16e"}]`
const BUCKET_GONE =
  '{"message_type":"exit_error","code":1,"message":"Fatal: unable to save snapshot: bucket gone"}'

const ORG = 'org1'
const CONN = 'conn1'
const DAY = 24 * 60 * 60 * 1000

const root = mkdtempSync(path.join(tmpdir(), 'backup-engine-test-'))
const rec = path.join(root, 'rec')
const dataDir = path.join(root, 'data')
const repoDir = path.join(root, 'repo')
const uploadsDir = path.join(dataDir, 'uploads', ORG)
const fake = path.join(root, 'restic.sh')
const savedEnv = { ...process.env }

function heredoc(line: string): string {
  return `cat <<'EOF'\n${line}\nEOF`
}

writeFileSync(
  fake,
  `#!/bin/sh
REC='${rec}'
n=$(cat "$REC/count" 2>/dev/null || echo 0)
n=$((n+1))
echo "$n" > "$REC/count"
printf '%s\\n' "$@" > "$REC/$n.argv"
/usr/bin/env > "$REC/$n.env"
sub=''
skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in
    --json) ;;
    --repo|-o) skip=1 ;;
    *) sub="$a"; break ;;
  esac
done
if [ -f "$REC/fail-$sub" ]; then
  cat "$REC/fail-$sub" >&2
  exit 1
fi
case "$sub" in
  init)
    ${heredoc(INIT_LINE)}
    ;;
  backup)
    after=0
    for a in "$@"; do
      if [ "$after" = 1 ] && [ -f "$a/data.json" ]; then cp "$a/data.json" "$REC/$n.data.json"; fi
      if [ "$a" = "--" ]; then after=1; fi
    done
    ${heredoc(`${STATUS_LINE}\n${SUMMARY_LINE}`)}
    if [ -f "$REC/partial-backup" ]; then
      echo '{"message_type":"error","error":{"message":"open /data/x.jpg: permission denied"},"during":"archival","item":"/data/x.jpg"}' >&2
      exit 3
    fi
    ;;
  forget)
    ${heredoc(FORGET_LINE)}
    ;;
  check)
    ${heredoc(CHECK_LINE)}
    ;;
  stats)
    ${heredoc(STATS_LINE)}
    ;;
  snapshots)
    ${heredoc(SNAPSHOTS_LINE)}
    ;;
  *) ;;
esac
exit 0
`
)
chmodSync(fake, 0o755)

type Call = { sub: string; argv: string[]; env: Record<string, string>; data: string | null }

function subcommand(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') continue
    if (argv[i] === '--repo' || argv[i] === '-o') {
      i++
      continue
    }
    return argv[i]
  }
  return ''
}

/** Every restic call so far, in order. */
function calls(): Call[] {
  if (!existsSync(path.join(rec, 'count'))) return []
  const n = Number(readFileSync(path.join(rec, 'count'), 'utf8').trim())
  return Array.from({ length: n }, (_, i) => {
    const argv = readFileSync(path.join(rec, `${i + 1}.argv`), 'utf8')
      .split('\n')
      .slice(0, -1)
    const env: Record<string, string> = {}
    for (const line of readFileSync(path.join(rec, `${i + 1}.env`), 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
    }
    for (const key of ['PWD', 'OLDPWD', 'SHLVL', '_']) delete env[key]
    const dataFile = path.join(rec, `${i + 1}.data.json`)
    const data = existsSync(dataFile) ? readFileSync(dataFile, 'utf8') : null
    return { sub: subcommand(argv), argv, env, data }
  })
}

function callsOf(sub: string): Call[] {
  return calls().filter((c) => c.sub === sub)
}

function addConnection(over: Row = {}): Row {
  const row = {
    id: CONN,
    organizationId: ORG,
    connectorId: 's3',
    status: 'active',
    lastError: null,
    settings: { frequency: 'daily', contents: 'data', includeFiles: true },
    state: {},
    ...over,
  }
  h.connections.set(row.id, row)
  return row
}

function addRun(over: Row = {}): string {
  const id = `run${++h.seq}`
  h.runs.set(id, {
    id,
    organizationId: ORG,
    kind: 'destination',
    connectionId: CONN,
    trigger: 'manual',
    status: 'queued',
    startedAt: null,
    finishedAt: null,
    snapshotId: null,
    filesNew: null,
    bytesAdded: null,
    totalBytes: null,
    error: null,
    createdAt: new Date(),
    ...over,
  })
  return id
}

const PLATFORM_ENV = {
  PLATFORM_BACKUP_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  PLATFORM_BACKUP_S3_BUCKET: 'torqvoice-workshop-backups',
  PLATFORM_BACKUP_S3_ACCESS_KEY: 'platform-key-id',
  PLATFORM_BACKUP_S3_SECRET_KEY: 'platform-key-secret',
  PLATFORM_BACKUP_MASTER_KEY: 'k7Qe2Vx9Lm4Rt8Zp1Ws6Yd3Hn5Jc0Bf7Gu2Ia9Oq',
}

/** The cloud instance with platform backups configured. */
function setPlatformEnv(): void {
  h.cloud = true
  h.features = { platformBackups: true }
  Object.assign(process.env, PLATFORM_ENV)
}

function failRestic(sub: string, stderr = BUCKET_GONE): void {
  writeFileSync(path.join(rec, `fail-${sub}`), `${stderr}\n`)
}

/** Restic writes the next snapshot but exits 3: some files could not be read. */
function partialBackup(): void {
  writeFileSync(path.join(rec, 'partial-backup'), '')
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  h.runs.clear()
  h.connections.clear()
  h.platform.clear()
  h.cloud = false
  h.features = { platformBackups: false }
  h.seq = 0
  h.members = [
    { user: { email: 'owner@workshop.test' } },
    { user: { email: 'admin@workshop.test' } },
  ]
  h.server = {
    backupTarget: {
      repository: async () => ({
        repository: repoDir,
        env: { AWS_ACCESS_KEY_ID: 'theirs-id', AWS_SECRET_ACCESS_KEY: 'theirs-secret' },
      }),
    },
  }
  rmSync(rec, { recursive: true, force: true })
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(rec, { recursive: true })
  mkdirSync(uploadsDir, { recursive: true })
  writeFileSync(path.join(uploadsDir, 'photo.jpg'), 'jpeg bytes')
  process.env.DATA_ROOT = dataDir
  process.env.RESTIC_BIN = fake
  delete process.env.BACKUP_LOCAL_ROOT
  ;(globalThis as Row).__torqvoiceBackupLock = null
  ;(globalThis as Row).__torqvoiceBackupDraining = false
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

describe('queueBackupRun', () => {
  it('creates a queued run for a backup destination', async () => {
    addConnection()
    const { runId } = await queueBackupRun({ kind: 'destination', connectionId: CONN }, 'manual', {
      requestedBy: 'user1',
    })
    expect(h.runs.get(runId)).toMatchObject({
      organizationId: ORG,
      kind: 'destination',
      connectionId: CONN,
      trigger: 'manual',
      status: 'queued',
      requestedBy: 'user1',
      reason: null,
    })
  })

  it('still accepts a plain connection id', async () => {
    addConnection()
    const { runId } = await queueBackupRun(CONN, 'scheduled')
    expect(h.runs.get(runId)).toMatchObject({
      kind: 'destination',
      connectionId: CONN,
      requestedBy: null,
    })
  })

  it('a run queued for one destination does not block another destination or the platform', async () => {
    addConnection()
    addConnection({ id: 'conn2' })
    setPlatformEnv()
    addRun({ status: 'running' })
    await expect(
      queueBackupRun({ kind: 'destination', connectionId: 'conn2' }, 'manual')
    ).resolves.toHaveProperty('runId')
    await expect(
      queueBackupRun({ kind: 'platform', organizationId: ORG }, 'manual')
    ).resolves.toHaveProperty('runId')
    await expect(
      queueBackupRun({ kind: 'platform', organizationId: ORG }, 'manual')
    ).rejects.toBeInstanceOf(BackupBusyError)
  })

  it('makes a platform run with no connection, and refuses one when platform backups are off', async () => {
    await expect(
      queueBackupRun({ kind: 'platform', organizationId: ORG }, 'scheduled')
    ).rejects.toThrow(/not configured/)
    setPlatformEnv()
    const { runId } = await queueBackupRun({ kind: 'platform', organizationId: ORG }, 'scheduled', {
      reason: 'support check',
    })
    expect(h.runs.get(runId)).toMatchObject({
      organizationId: ORG,
      kind: 'platform',
      connectionId: null,
      trigger: 'scheduled',
      status: 'queued',
      reason: 'support check',
    })
  })

  it.each(['queued', 'running'])('refuses while a run is %s', async (status) => {
    addConnection()
    addRun({ status })
    await expect(queueBackupRun(CONN, 'manual')).rejects.toBeInstanceOf(BackupBusyError)
    expect(h.runs.size).toBe(1)
  })

  it('queues again once the earlier run has finished', async () => {
    addConnection()
    addRun({ status: 'done' })
    addRun({ status: 'failed' })
    await expect(queueBackupRun(CONN, 'scheduled')).resolves.toHaveProperty('runId')
  })

  it('refuses a connector that is not a backup destination', async () => {
    addConnection({ connectorId: 'not-backup' })
    await expect(queueBackupRun(CONN, 'manual')).rejects.toThrow(/not a backup destination/)
    expect(h.runs.size).toBe(0)
  })

  it('refuses a connection that does not exist', async () => {
    await expect(queueBackupRun('nope', 'manual')).rejects.toThrow(/not found/)
  })
})

describe('runBackup, happy path', () => {
  it('records running, then done with the snapshot figures', async () => {
    addConnection()
    const runId = addRun()
    const statuses: string[] = []
    const { db } = await import('@/lib/db')
    vi.mocked(db.backupRun.update).mockImplementation((async ({ where, data }: Row) => {
      if (data.status) statuses.push(data.status)
      const row = merge(h.runs.get(where.id) ?? {}, data)
      h.runs.set(where.id, row)
      return row
    }) as never)

    const view = await runBackup(runId)

    expect(statuses).toEqual(['running', 'done'])
    expect(view).toMatchObject({
      id: runId,
      status: 'done',
      snapshotId: SNAPSHOT_ID,
      filesNew: 2,
      bytesAdded: 3851,
      totalBytes: 6928,
      error: null,
    })
    const row = h.runs.get(runId) as Row
    expect(row.startedAt).toBeInstanceOf(Date)
    expect(row.finishedAt).toBeInstanceOf(Date)
    expect(row.bytesAdded).toBe(BigInt(3851))
    expect(row.totalBytes).toBe(BigInt(6928))
  })

  it('backs up the staging folder and the uploads folder with the workshop host and tags', async () => {
    addConnection()
    await runBackup(addRun({ trigger: 'scheduled' }))

    const [backup] = callsOf('backup')
    const staging = stagingDirFor(ORG)
    expect(staging).toBe(path.join(tmpdir(), 'torqvoice-backup-staging', ORG))
    const tail = backup.argv.slice(backup.argv.indexOf('backup'))
    expect(tail).toEqual([
      'backup',
      '--host',
      `torqvoice-${ORG}`,
      '--tag',
      `org:${ORG}`,
      '--tag',
      'scheduled',
      '--',
      staging,
      uploadsDir,
    ])
    expect(backup.argv.slice(0, 3)).toEqual(['--json', '--repo', repoDir])
    // The data file was in place while restic read it.
    expect(JSON.parse(backup.data ?? 'null')).toMatchObject({ organizationId: ORG })
  })

  it('backs up only the staging folder when files are left out', async () => {
    addConnection({ settings: { frequency: 'daily', includeFiles: false } })
    await runBackup(addRun())
    const [backup] = callsOf('backup')
    expect(backup.argv.slice(backup.argv.indexOf('--') + 1)).toEqual([stagingDirFor(ORG)])
  })

  it('backs up only the staging folder when the workshop has no uploads yet', async () => {
    addConnection()
    rmSync(uploadsDir, { recursive: true, force: true })
    await runBackup(addRun())
    const [backup] = callsOf('backup')
    expect(backup.argv.slice(backup.argv.indexOf('--') + 1)).toEqual([stagingDirFor(ORG)])
  })

  it("runs init, unlock, backup, forget, the safety copies' forget, prune, check and stats in that order", async () => {
    addConnection()
    await runBackup(addRun())
    expect(calls().map((c) => c.sub)).toEqual([
      'init',
      'unlock',
      'backup',
      'forget',
      'forget',
      'forget',
      'check',
      'stats',
    ])
    const [retention, safety, prune] = callsOf('forget')
    // Retention after every run, keeping the safety copies, without a prune.
    expect(retention.argv).toEqual(
      expect.arrayContaining([
        '--group-by',
        'host',
        '--host',
        `torqvoice-${ORG}`,
        '--tag',
        `org:${ORG}`,
        '--keep-tag',
        'pre-restore',
      ])
    )
    expect(retention.argv).not.toContain('--prune')
    // The safety copies go after ninety days, whatever the policy says.
    expect(safety.argv.slice(safety.argv.indexOf('forget'))).toEqual([
      'forget',
      '--group-by',
      'host',
      '--host',
      `torqvoice-${ORG}`,
      '--tag',
      'pre-restore',
      '--keep-within',
      '90d',
    ])
    // The first run prunes: the same policy again, with --prune.
    expect(prune.argv).toEqual(
      expect.arrayContaining(['--keep-tag', 'pre-restore', '--prune', '--max-unused', '10%'])
    )
  })

  it('creates the local repository folder before restic is asked to init it', async () => {
    addConnection()
    await runBackup(addRun())
    expect(existsSync(repoDir)).toBe(true)
  })

  it('prunes and checks a repository that never had either', async () => {
    addConnection()
    await runBackup(addRun())
    expect(callsOf('forget')[0].argv).not.toContain('--prune')
    expect(callsOf('forget')[2].argv).toContain('--prune')
    expect(callsOf('check')[0].argv).toContain('--read-data-subset=2%')
    const state = h.connections.get(CONN)?.state
    expect(typeof state['backup.lastPruneAt']).toBe('string')
    expect(typeof state['backup.lastCheckAt']).toBe('string')
  })

  it('prunes only when the last prune is older than 7 days', async () => {
    const recent = ago(6 * DAY)
    addConnection({ state: { 'backup.lastPruneAt': recent, 'backup.lastCheckAt': ago(DAY) } })
    await runBackup(addRun())
    expect(callsOf('forget')).toHaveLength(2)
    expect(callsOf('forget').some((c) => c.argv.includes('--prune'))).toBe(false)
    expect(h.connections.get(CONN)?.state['backup.lastPruneAt']).toBe(recent)

    rmSync(rec, { recursive: true, force: true })
    mkdirSync(rec)
    h.connections.get(CONN)!.state['backup.lastPruneAt'] = ago(8 * DAY)
    await runBackup(addRun())
    expect(callsOf('forget')).toHaveLength(3)
    expect(callsOf('forget')[0].argv).not.toContain('--prune')
    expect(callsOf('forget')[2].argv).toEqual(
      expect.arrayContaining(['--prune', '--max-unused', '10%'])
    )
    const stamped = new Date(h.connections.get(CONN)?.state['backup.lastPruneAt']).getTime()
    expect(Date.now() - stamped).toBeLessThan(60_000)
  })

  it('checks only when the last check is older than 30 days', async () => {
    const recent = ago(29 * DAY)
    addConnection({ state: { 'backup.lastPruneAt': ago(DAY), 'backup.lastCheckAt': recent } })
    await runBackup(addRun())
    expect(callsOf('check')).toHaveLength(0)
    expect(h.connections.get(CONN)?.state['backup.lastCheckAt']).toBe(recent)

    rmSync(rec, { recursive: true, force: true })
    mkdirSync(rec)
    h.connections.get(CONN)!.state['backup.lastCheckAt'] = ago(31 * DAY)
    await runBackup(addRun())
    expect(callsOf('check')).toHaveLength(1)
    const stamped = new Date(h.connections.get(CONN)?.state['backup.lastCheckAt']).getTime()
    expect(Date.now() - stamped).toBeLessThan(60_000)
  })

  it('a failed check does not fail the backup and is tried again next run', async () => {
    addConnection({ state: { 'backup.lastPruneAt': ago(DAY) } })
    failRestic(
      'check',
      '{"message_type":"exit_error","code":1,"message":"Fatal: repository contains errors"}'
    )
    const view = await runBackup(addRun())
    expect(view.status).toBe('done')
    expect(h.connections.get(CONN)?.state['backup.lastCheckAt']).toBeUndefined()
  })

  it('saves lastGoodAt and the repository size and sets the connection active', async () => {
    addConnection({ status: 'error', lastError: 'old failure', state: { keep: 'me' } })
    await runBackup(addRun())
    const conn = h.connections.get(CONN) as Row
    expect(conn.state.keep).toBe('me')
    expect(Date.now() - new Date(conn.state['backup.lastGoodAt']).getTime()).toBeLessThan(60_000)
    expect(conn.state['backup.repositorySize']).toBe(6928)
    expect(setConnectionStatus).toHaveBeenCalledWith(CONN, 'active')
    expect(conn.status).toBe('active')
    expect(conn.lastError).toBeNull()
  })

  it('a failed stats call still finishes the run as done, without a size', async () => {
    addConnection()
    failRestic('stats')
    const view = await runBackup(addRun())
    expect(view.status).toBe('done')
    expect(view.totalBytes).toBeNull()
    expect(h.connections.get(CONN)?.state['backup.repositorySize']).toBeUndefined()
  })

  it('deletes the staged data file afterwards', async () => {
    addConnection()
    await runBackup(addRun())
    expect(callsOf('backup')[0].data).not.toBeNull()
    expect(existsSync(path.join(stagingDirFor(ORG), 'data.json'))).toBe(false)
  })

  it('releases the lock when done', async () => {
    addConnection()
    await runBackup(addRun())
    expect(backupLockHolder()).toBeNull()
  })

  it('leaves a run that is no longer queued alone', async () => {
    addConnection()
    const runId = addRun({ status: 'done', snapshotId: 'abc' })
    const view = await runBackup(runId)
    expect(view).toMatchObject({ status: 'done', snapshotId: 'abc' })
    expect(calls()).toHaveLength(0)
  })
})

describe('runBackup, contents', () => {
  it("passes includeSecrets true for 'dataAndSecrets'", async () => {
    addConnection({ settings: { contents: 'dataAndSecrets' } })
    await runBackup(addRun())
    expect(writeBackupData).toHaveBeenCalledTimes(1)
    const [org, options] = vi.mocked(writeBackupData).mock.calls[0]
    expect(org).toBe(ORG)
    expect(options).toMatchObject({ includeSecrets: true, files: false })
  })

  it("passes includeSecrets false for 'data'", async () => {
    addConnection({ settings: { contents: 'data' } })
    await runBackup(addRun())
    expect(vi.mocked(writeBackupData).mock.calls[0][1]).toMatchObject({
      includeSecrets: false,
      files: false,
    })
  })
})

describe('runBackup, environment', () => {
  it('gives restic nothing from process.env, only the destination env', async () => {
    process.env.AWS_SECRET_ACCESS_KEY = 'ours'
    process.env.AWS_ACCESS_KEY_ID = 'ours'
    process.env.DATABASE_URL = 'postgres://ours'
    process.env.RESTIC_PASSWORD = 'ours'
    addConnection()
    await runBackup(addRun())

    const all = calls()
    expect(all.length).toBeGreaterThan(0)
    for (const call of all) {
      expect(call.env.AWS_SECRET_ACCESS_KEY, call.sub).toBe('theirs-secret')
      expect(call.env.AWS_ACCESS_KEY_ID, call.sub).toBe('theirs-id')
      expect(call.env.RESTIC_PASSWORD, call.sub).toBe(h.password)
      expect(call.env.DATABASE_URL, call.sub).toBeUndefined()
      expect(call.env.DATA_ROOT, call.sub).toBeUndefined()
      expect(call.env.RESTIC_BIN, call.sub).toBeUndefined()
      expect(
        Object.values(call.env).some((v) => v.includes('ours')),
        call.sub
      ).toBe(false)
      expect(Object.keys(call.env).sort(), call.sub).toEqual(
        [
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
          'GOGC',
          'HOME',
          'PATH',
          'RESTIC_CACHE_DIR',
          'RESTIC_PASSWORD',
          'RESTIC_REPOSITORY',
          'TMPDIR',
        ].sort()
      )
      expect(call.env.RESTIC_CACHE_DIR).toBe(path.join(dataDir, 'restic-cache', ORG))
      expect(call.argv.join(' ')).not.toContain(h.password)
    }
  })
})

describe('runBackup, failure', () => {
  it('marks the run failed, sets the connection to error, notifies and mails once', async () => {
    addConnection()
    failRestic('backup')
    const runId = addRun()

    const view = await runBackup(runId)

    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/bucket gone/)
    expect(view.snapshotId).toBeNull()
    expect(h.runs.get(runId)?.finishedAt).toBeInstanceOf(Date)
    expect(setConnectionStatus).toHaveBeenCalledWith(CONN, 'error', view.error)
    expect(h.connections.get(CONN)?.status).toBe('error')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notify).mock.calls[0][0]).toMatchObject({
      organizationId: ORG,
      type: 'backup_failed',
      entityType: 'IntegrationConnection',
      entityId: CONN,
      entityUrl: '/settings/integrations/s3',
    })
    expect(sendOrgMail).toHaveBeenCalledTimes(2)
    expect(
      vi
        .mocked(sendOrgMail)
        .mock.calls.map((c) => (c[1] as Row).to)
        .sort()
    ).toEqual(['admin@workshop.test', 'owner@workshop.test'])
    expect(typeof h.connections.get(CONN)?.state['backup.lastFailureMailAt']).toBe('string')
    // No forget after a failed backup, and no good-backup stamp.
    expect(callsOf('forget')).toHaveLength(0)
    expect(h.connections.get(CONN)?.state['backup.lastGoodAt']).toBeUndefined()
    expect(existsSync(path.join(stagingDirFor(ORG), 'data.json'))).toBe(false)
    expect(backupLockHolder()).toBeNull()
  })

  it('a failed scheduled run books one retry 30 minutes later', async () => {
    addConnection()
    failRestic('backup')
    const before = Date.now()
    await runBackup(addRun({ trigger: 'scheduled' }))
    const retryAt = new Date(h.connections.get(CONN)?.state['backup.retryAt']).getTime()
    expect(retryAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000)
    expect(retryAt).toBeLessThan(Date.now() + 30 * 60 * 1000 + 1000)
  })

  it('a failed manual run books no retry', async () => {
    addConnection()
    failRestic('backup')
    await runBackup(addRun({ trigger: 'manual' }))
    expect(h.connections.get(CONN)?.state['backup.retryAt']).toBeUndefined()
  })

  it('asks owners and admins only', async () => {
    addConnection()
    failRestic('backup')
    await runBackup(addRun())
    const { db } = await import('@/lib/db')
    expect(vi.mocked(db.organizationMember.findMany).mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG, role: { in: ['owner', 'admin'] } },
    })
  })

  it('does not mail again within 24 hours, but still notifies', async () => {
    addConnection()
    failRestic('backup')
    await runBackup(addRun())
    await runBackup(addRun())
    expect(notify).toHaveBeenCalledTimes(2)
    expect(sendOrgMail).toHaveBeenCalledTimes(2)
  })

  it('mails again once the last failure mail is older than 24 hours', async () => {
    addConnection({ state: { 'backup.lastFailureMailAt': ago(25 * 60 * 60 * 1000) } })
    failRestic('backup')
    await runBackup(addRun())
    expect(sendOrgMail).toHaveBeenCalledTimes(2)
  })

  it('a backup restic could not read every file for fails the run, retries and reports it', async () => {
    addConnection()
    partialBackup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const before = Date.now()
      const runId = addRun({ trigger: 'scheduled' })

      const view = await runBackup(runId)

      expect(view.status).toBe('failed')
      expect(view.error).toBe(
        'Some files could not be read, so this backup is incomplete (restic snapshot 28891c8f). Check the server log and run the backup again.'
      )
      expect(view.snapshotId).toBeNull()
      expect(callsOf('backup')).toHaveLength(1)
      // Not a good backup: no retention, no stamp, the connection in error.
      expect(callsOf('forget')).toHaveLength(0)
      const conn = h.connections.get(CONN) as Row
      expect(conn.state['backup.lastGoodAt']).toBeUndefined()
      expect(setConnectionStatus).not.toHaveBeenCalledWith(CONN, 'active')
      expect(conn.status).toBe('error')
      expect(new Date(conn.state['backup.retryAt']).getTime()).toBeGreaterThanOrEqual(
        before + 30 * 60 * 1000
      )
      expect(notify).toHaveBeenCalledTimes(1)
      expect(sendOrgMail).toHaveBeenCalledTimes(2)
      expect(backupLockHolder()).toBeNull()
    } finally {
      errors.mockRestore()
    }
  })

  it('a partial platform backup records no good run and no restore points', async () => {
    setPlatformEnv()
    h.features = { platformBackups: true }
    partialBackup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const view = await runBackup(addRun({ kind: 'platform', connectionId: null }))
      expect(view.status).toBe('failed')
      expect(view.error).toMatch(/incomplete/)
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('Backup is incomplete: some files could not be read'),
        expect.objectContaining({ snapshot: SNAPSHOT_ID })
      )
      expect(callsOf('forget')).toHaveLength(0)
      expect(callsOf('snapshots')).toHaveLength(0)
      const row = h.platform.get(ORG) as Row | undefined
      expect(row?.lastGoodAt ?? undefined).toBeUndefined()
      expect(row?.snapshots ?? undefined).toBeUndefined()
    } finally {
      errors.mockRestore()
    }
  })

  it('a failed forget fails the run', async () => {
    addConnection()
    failRestic('forget')
    const view = await runBackup(addRun())
    expect(view.status).toBe('failed')
    expect(h.connections.get(CONN)?.state['backup.lastGoodAt']).toBeUndefined()
  })

  it('a destination without a backup target fails the run', async () => {
    addConnection()
    h.server = {}
    const view = await runBackup(addRun())
    expect(view.status).toBe('failed')
    expect(view.error).toMatch(/not a backup destination/)
    expect(calls()).toHaveLength(0)
  })

  it('a short password fails the run before restic runs', async () => {
    addConnection()
    h.password = 'short'
    try {
      const view = await runBackup(addRun())
      expect(view.status).toBe('failed')
      expect(view.error).toMatch(/at least 8 characters/)
      expect(calls()).toHaveLength(0)
    } finally {
      h.password = 'correct horse battery'
    }
  })

  // Documents expected behaviour. stagingDirFor() runs after the lock is
  // taken but outside the try/finally that releases it (engine.ts:145), so
  // an organisation id it refuses leaves the lock held for good and every
  // later run on this server finishes as skipped.
  it('an organisation id the staging folder refuses fails the run and frees the lock', async () => {
    addConnection({ organizationId: 'org-1' })
    const runId = addRun({ organizationId: 'org-1' })
    await runBackup(runId).catch(() => undefined)
    expect(backupLockHolder()).toBeNull()
    expect(h.runs.get(runId)?.status).toBe('failed')
  })
})

describe('runBackup, lock', () => {
  it('a second run while one is going stays queued and runs once the first is done', async () => {
    addConnection()
    addConnection({ id: 'conn2' })
    const first = addRun()
    const second = addRun({ connectionId: 'conn2' })

    const [a, b] = await Promise.all([runBackup(first), runBackup(second)])

    expect(a.status).toBe('done')
    expect(b.status).toBe('queued')
    expect(b.error).toBeNull()
    // The first run's finish drains the queue, which starts the second.
    await vi.waitFor(() => expect(h.runs.get(second)?.status).toBe('done'))
    expect(callsOf('backup')).toHaveLength(2)
    expect(h.runs.get(second)?.startedAt.getTime()).toBeGreaterThanOrEqual(
      h.runs.get(first)?.finishedAt.getTime()
    )
    await vi.waitFor(() => expect(backupLockHolder()).toBeNull())
  })

  it("a run that finds another holder's lock stays queued and the holder keeps the lock", async () => {
    addConnection()
    ;(globalThis as Row).__torqvoiceBackupLock = { runId: 'other', since: Date.now() }
    const runId = addRun()
    const view = await runBackup(runId)
    expect(view.status).toBe('queued')
    expect(h.runs.get(runId)?.status).toBe('queued')
    expect(h.runs.get(runId)?.startedAt).toBeNull()
    expect(calls()).toHaveLength(0)
    expect(backupLockHolder()?.runId).toBe('other')
  })
})

describe('drainBackupQueue', () => {
  it('works through the queued runs oldest first, one after the other', async () => {
    addConnection()
    addConnection({ id: 'conn2' })
    const started: string[] = []
    const { db } = await import('@/lib/db')
    vi.mocked(db.backupRun.update).mockImplementation((async ({ where, data }: Row) => {
      if (data.status === 'running') {
        // Nothing else holds the lock or is running while this one starts.
        expect([...h.runs.values()].filter((r) => r.status === 'running')).toEqual([])
        started.push(where.id)
      }
      const row = merge(h.runs.get(where.id) ?? {}, data)
      h.runs.set(where.id, row)
      return row
    }) as never)
    // Added first, queued later: the order is by createdAt, not by insertion.
    const newer = addRun({ createdAt: new Date(Date.now() - 1000) })
    const older = addRun({ connectionId: 'conn2', createdAt: new Date(Date.now() - 60_000) })

    expect(await drainBackupQueue()).toBe(2)

    expect(started).toEqual([older, newer])
    expect(h.runs.get(older)?.status).toBe('done')
    expect(h.runs.get(newer)?.status).toBe('done')
    expect(h.runs.get(newer)?.startedAt.getTime()).toBeGreaterThanOrEqual(
      h.runs.get(older)?.finishedAt.getTime()
    )
    expect(callsOf('backup')).toHaveLength(2)
    expect(backupLockHolder()).toBeNull()
  })

  it('returns 0 and starts nothing while another run holds the lock', async () => {
    addConnection()
    ;(globalThis as Row).__torqvoiceBackupLock = { runId: 'other', since: Date.now() }
    const runId = addRun()
    expect(await drainBackupQueue()).toBe(0)
    expect(h.runs.get(runId)?.status).toBe('queued')
    expect(calls()).toHaveLength(0)
    expect(backupLockHolder()?.runId).toBe('other')
  })

  it('a second call while one is draining returns 0 at once', async () => {
    addConnection()
    const runId = addRun()
    const draining = drainBackupQueue()
    expect(await drainBackupQueue()).toBe(0)
    expect(await draining).toBe(1)
    expect(h.runs.get(runId)?.status).toBe('done')
    expect(callsOf('backup')).toHaveLength(1)
  })

  it('returns 0 when nothing is queued', async () => {
    addConnection()
    addRun({ status: 'done' })
    expect(await drainBackupQueue()).toBe(0)
    expect(calls()).toHaveLength(0)
  })
})

describe('openPlatform', () => {
  it("opens the workshop's own repository in the platform bucket, with the platform keys only", async () => {
    setPlatformEnv()
    const target = await openPlatform(ORG)

    expect(target.kind).toBe('platform')
    expect(target.organizationId).toBe(ORG)
    expect(target.connectionId).toBeNull()
    expect(target.base.repository.repository).toBe(
      `s3:https://acc.r2.cloudflarestorage.com/${PLATFORM_ENV.PLATFORM_BACKUP_S3_BUCKET}/workshops/${ORG}`
    )
    expect(target.base.repository.env).toEqual({
      AWS_ACCESS_KEY_ID: PLATFORM_ENV.PLATFORM_BACKUP_S3_ACCESS_KEY,
      AWS_SECRET_ACCESS_KEY: PLATFORM_ENV.PLATFORM_BACKUP_S3_SECRET_KEY,
    })
    expect(target.base.repository.options).toEqual({ 's3.region': 'auto' })
    expect(target.base.password).toMatch(/^[0-9a-f]{64}$/)
    expect(target.base.password).toBe(
      platformRepositoryPassword(PLATFORM_ENV.PLATFORM_BACKUP_MASTER_KEY, ORG)
    )
    expect(target.includeFiles).toBe(true)
    expect(target.includeSecrets).toBe(true)
    expect(target.tags('scheduled')).toEqual([`org:${ORG}`, 'scheduled', 'platform'])
    // The workshop's row is made on first use.
    expect(h.platform.get(ORG)).toMatchObject({ organizationId: ORG })
  })

  it('gives every workshop a password of its own', async () => {
    setPlatformEnv()
    const a = await openPlatform('org1')
    const b = await openPlatform('org2')
    expect(a.base.password).not.toBe(b.base.password)
    expect(a.base.repository.repository).not.toBe(b.base.repository.repository)
    expect(b.base.repository.repository.endsWith('/workshops/org2')).toBe(true)
  })

  it('refuses when platform backups are not configured', async () => {
    h.cloud = true
    await expect(openPlatform(ORG)).rejects.toThrow(/not configured/)
    expect(h.platform.size).toBe(0)
  })
})

describe('runBackup, platform', () => {
  it('backs up into the platform repository and records the restore points on the row', async () => {
    setPlatformEnv()
    const runId = addRun({ kind: 'platform', connectionId: null, trigger: 'scheduled' })

    const view = await runBackup(runId)

    expect(view.status, view.error ?? '').toBe('done')
    expect(view.snapshotId).toBe(SNAPSHOT_ID)
    expect(calls().map((c) => c.sub)).toEqual([
      'init',
      'unlock',
      'backup',
      'forget',
      'forget',
      'forget',
      'check',
      'stats',
      'snapshots',
    ])
    const repository = `s3:https://acc.r2.cloudflarestorage.com/${PLATFORM_ENV.PLATFORM_BACKUP_S3_BUCKET}/workshops/${ORG}`
    for (const call of calls()) {
      expect(call.env.RESTIC_REPOSITORY, call.sub).toBe(repository)
      expect(call.env.AWS_ACCESS_KEY_ID, call.sub).toBe(PLATFORM_ENV.PLATFORM_BACKUP_S3_ACCESS_KEY)
      expect(call.env.RESTIC_PASSWORD, call.sub).toBe(
        platformRepositoryPassword(PLATFORM_ENV.PLATFORM_BACKUP_MASTER_KEY, ORG)
      )
      expect(call.argv.join(' '), call.sub).toContain('-o s3.region=auto')
    }
    const [backup] = callsOf('backup')
    expect(backup.argv).toEqual(
      expect.arrayContaining(['--tag', `org:${ORG}`, '--tag', 'scheduled', '--tag', 'platform'])
    )
    // Secret keys are always in a platform backup.
    expect(vi.mocked(writeBackupData).mock.calls[0][1]).toMatchObject({ includeSecrets: true })
    // No connection is opened for a platform run.
    expect(loadConnection).not.toHaveBeenCalled()

    const { db } = await import('@/lib/db')
    const update = vi
      .mocked(db.platformBackup.update)
      .mock.calls.map((c) => c[0] as Row)
      .find((c) => Array.isArray(c.data.snapshots))
    expect(update?.where).toEqual({ organizationId: ORG })
    const row = h.platform.get(ORG) as Row
    expect(row.snapshots).toEqual([
      expect.objectContaining({ id: SNAPSHOT_ID, trigger: 'scheduled', preRestore: false }),
      expect.objectContaining({ id: SAFETY_ID, trigger: null, preRestore: true }),
    ])
    expect(row.lastGoodAt).toBeInstanceOf(Date)
    expect(row.lastPruneAt).toBeInstanceOf(Date)
    expect(row.lastCheckAt).toBeInstanceOf(Date)
    expect(row.repositorySize).toBe(BigInt(6928))
    expect(row.retryAt).toBeNull()
  })

  it('a failed scheduled platform run books its retry on the platform row and tells nobody', async () => {
    setPlatformEnv()
    failRestic('backup')
    const before = Date.now()
    const view = await runBackup(
      addRun({ kind: 'platform', connectionId: null, trigger: 'scheduled' })
    )
    expect(view.status).toBe('failed')
    const retryAt = (h.platform.get(ORG) as Row).retryAt as Date
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60 * 1000)
    expect(notify).not.toHaveBeenCalled()
    expect(sendOrgMail).not.toHaveBeenCalled()
  })
})

describe('takeSafetySnapshot', () => {
  it('keeps the uploads folder in the safety copy even when the destination leaves files out', async () => {
    addConnection({ settings: { frequency: 'daily', contents: 'data', includeFiles: false } })
    const target = await openTarget({ kind: 'destination', connectionId: CONN })
    expect(target.includeFiles).toBe(false)

    const safety = await takeSafetySnapshot(ORG, target)

    expect(safety).toEqual({ snapshotId: SNAPSHOT_ID, kind: 'destination' })
    const [backup] = callsOf('backup')
    expect(backup.argv).toEqual(expect.arrayContaining(['--tag', 'pre-restore']))
    expect(backup.argv.slice(backup.argv.indexOf('--') + 1)).toEqual([
      stagingDirFor(ORG),
      uploadsDir,
    ])
    // A destination set to "Data only" still gets the secret keys in the
    // safety copy, so undoing the restore gives today's keys back.
    expect(target.includeSecrets).toBe(false)
    expect(vi.mocked(writeBackupData).mock.calls[0][1]).toMatchObject({ includeSecrets: true })
    // A destination keeps no restore point list of ours.
    expect(callsOf('snapshots')).toEqual([])
  })

  it('lists the platform safety copy as a restore point right away', async () => {
    setPlatformEnv()
    const target = await openPlatform(ORG)

    const safety = await takeSafetySnapshot(ORG, target)

    expect(safety).toEqual({ snapshotId: SNAPSHOT_ID, kind: 'platform' })
    expect(calls().map((c) => c.sub)).toEqual(['init', 'unlock', 'backup', 'snapshots'])
    const [listing] = callsOf('snapshots')
    expect(listing.argv).toEqual(
      expect.arrayContaining(['--host', `torqvoice-${ORG}`, '--tag', `org:${ORG}`])
    )
    const { db } = await import('@/lib/db')
    const update = vi
      .mocked(db.platformBackup.update)
      .mock.calls.map((c) => c[0] as Row)
      .find((c) => Array.isArray(c.data.snapshots))
    expect(update?.where).toEqual({ organizationId: ORG })
    // Only the list changes: no good run is recorded for a safety copy.
    expect(Object.keys(update?.data ?? {})).toEqual(['snapshots'])
    const row = h.platform.get(ORG) as Row
    expect(row.snapshots).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: SNAPSHOT_ID })])
    )
    expect(row.lastGoodAt).toBeUndefined()
  })

  it('refuses a safety copy restic could not read every file for, and records nothing', async () => {
    addConnection()
    partialBackup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const target = await openTarget({ kind: 'destination', connectionId: CONN })
      await expect(takeSafetySnapshot(ORG, target)).rejects.toThrow(
        'The safety copy is incomplete: some files could not be read. Nothing was changed.'
      )
      expect(callsOf('backup')).toHaveLength(1)
    } finally {
      errors.mockRestore()
    }
  })

  it('refuses a partial platform safety copy without listing it as a restore point', async () => {
    setPlatformEnv()
    partialBackup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const target = await openPlatform(ORG)
      await expect(takeSafetySnapshot(ORG, target)).rejects.toThrow(/incomplete/)
      expect(callsOf('snapshots')).toHaveLength(0)
      expect((h.platform.get(ORG) as Row | undefined)?.snapshots).toBeUndefined()
    } finally {
      errors.mockRestore()
    }
  })

  it('a failed listing is logged and the platform safety copy still succeeds', async () => {
    setPlatformEnv()
    failRestic('snapshots')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const target = await openPlatform(ORG)
      const safety = await takeSafetySnapshot(ORG, target)

      expect(safety).toEqual({ snapshotId: SNAPSHOT_ID, kind: 'platform' })
      expect(callsOf('snapshots')).toHaveLength(1)
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('Could not list the restore points'),
        expect.objectContaining({ error: expect.any(String) })
      )
      expect((h.platform.get(ORG) as Row).snapshots).toBeUndefined()
    } finally {
      errors.mockRestore()
    }
  })
})

const realBin = process.env.RESTIC_REAL_BIN

describe.skipIf(!realBin)('runBackup with the real restic binary', () => {
  it('takes two snapshots into a local folder, the second one small', async () => {
    process.env.RESTIC_BIN = realBin
    h.server = localFolder
    addConnection({ connectorId: 'local-folder' })
    // Incompressible, so the first run has to store it.
    const random = Buffer.alloc(256 * 1024)
    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256)
    writeFileSync(path.join(uploadsDir, 'big.bin'), random)

    const first = await runBackup(addRun())
    expect(first.status, first.error ?? '').toBe('done')
    expect(first.bytesAdded).toBeGreaterThan(200_000)

    writeFileSync(path.join(uploadsDir, 'photo.jpg'), 'new jpeg bytes')
    const second = await runBackup(addRun())
    expect(second.status, second.error ?? '').toBe('done')
    expect(second.snapshotId).not.toBe(first.snapshotId)
    expect(second.bytesAdded).toBeLessThan(20_000)

    const repo = path.join(dataDir, 'backups', ORG)
    expect(readdirSync(repo)).toContain('config')
    const snapshots = await resticSnapshots(
      {
        repository: { repository: repo, env: {} },
        password: h.password,
        cacheDir: path.join(dataDir, 'restic-cache', ORG),
      },
      { host: `torqvoice-${ORG}`, tags: [`org:${ORG}`] }
    )
    expect(snapshots).toHaveLength(2)
    expect(snapshots.every((s) => s.paths.includes(stagingDirFor(ORG)))).toBe(true)
    expect(existsSync(path.join(stagingDirFor(ORG), 'data.json'))).toBe(false)
    const state = h.connections.get(CONN)?.state
    expect(state['backup.repositorySize']).toBeGreaterThan(200_000)
  }, 120_000)
})
