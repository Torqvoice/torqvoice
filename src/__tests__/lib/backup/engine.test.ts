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

vi.mock('@/lib/db', () => ({
  db: {
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
      findFirst: vi.fn(
        async ({ where }: { where: { connectionId: string; status: { in: string[] } } }) =>
          [...h.runs.values()].find(
            (r) => r.connectionId === where.connectionId && where.status.in.includes(r.status)
          ) ?? null
      ),
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
  },
}))

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

vi.mock('@/lib/features', () => ({ isCloudMode: () => false }))

import { writeBackupData } from '@/lib/backup/build-data'
import {
  BackupBusyError,
  backupLockHolder,
  queueBackupRun,
  runBackup,
  stagingDirFor,
} from '@/lib/backup/engine'
import { resticSnapshots } from '@/lib/backup/restic'
import { setConnectionStatus } from '@/features/integrations/Lib/connections'
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

function failRestic(sub: string, stderr = BUCKET_GONE): void {
  writeFileSync(path.join(rec, `fail-${sub}`), `${stderr}\n`)
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  h.runs.clear()
  h.connections.clear()
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
    const { runId } = await queueBackupRun(CONN, 'manual')
    expect(h.runs.get(runId)).toMatchObject({
      organizationId: ORG,
      connectionId: CONN,
      trigger: 'manual',
      status: 'queued',
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

  it('runs init, unlock, backup, forget, check and stats in that order', async () => {
    addConnection()
    await runBackup(addRun())
    expect(calls().map((c) => c.sub)).toEqual([
      'init',
      'unlock',
      'backup',
      'forget',
      'check',
      'stats',
    ])
    const [forget] = callsOf('forget')
    expect(forget.argv).toEqual(
      expect.arrayContaining([
        '--group-by',
        'host',
        '--host',
        `torqvoice-${ORG}`,
        '--tag',
        `org:${ORG}`,
      ])
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
    expect(callsOf('forget')[0].argv).toContain('--prune')
    expect(callsOf('check')[0].argv).toContain('--read-data-subset=2%')
    const state = h.connections.get(CONN)?.state
    expect(typeof state['backup.lastPruneAt']).toBe('string')
    expect(typeof state['backup.lastCheckAt']).toBe('string')
  })

  it('prunes only when the last prune is older than 7 days', async () => {
    const recent = ago(6 * DAY)
    addConnection({ state: { 'backup.lastPruneAt': recent, 'backup.lastCheckAt': ago(DAY) } })
    await runBackup(addRun())
    expect(callsOf('forget')[0].argv).not.toContain('--prune')
    expect(h.connections.get(CONN)?.state['backup.lastPruneAt']).toBe(recent)

    rmSync(rec, { recursive: true, force: true })
    mkdirSync(rec)
    h.connections.get(CONN)!.state['backup.lastPruneAt'] = ago(8 * DAY)
    await runBackup(addRun())
    expect(callsOf('forget')[0].argv).toEqual(
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
  it('a second run while one is going finishes as skipped', async () => {
    addConnection()
    addConnection({ id: 'conn2' })
    const first = addRun()
    const second = addRun({ connectionId: 'conn2' })

    const [a, b] = await Promise.all([runBackup(first), runBackup(second)])

    expect(a.status).toBe('done')
    expect(b.status).toBe('skipped')
    expect(b.error).toMatch(/Another backup was running/)
    expect(callsOf('backup')).toHaveLength(1)
    expect(backupLockHolder()).toBeNull()
  })

  it('a run held by another lock holder is skipped and the holder keeps the lock', async () => {
    addConnection()
    ;(globalThis as Row).__torqvoiceBackupLock = { runId: 'other', since: Date.now() }
    const view = await runBackup(addRun())
    expect(view.status).toBe('skipped')
    expect(backupLockHolder()?.runId).toBe('other')
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
