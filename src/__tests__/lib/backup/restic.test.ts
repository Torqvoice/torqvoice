// @vitest-environment node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import {
  ResticError,
  redactArgv,
  resticBackup,
  resticCheck,
  resticForget,
  resticForgetSnapshot,
  resticInit,
  resticOpen,
  resticSnapshots,
  resticStats,
  resticUnlock,
  resticVersion,
  runRestic,
  resticRestore,
} from '@/lib/backup/restic'

// Lines below are copied from restic 0.19.1 `--json` output.
const SUMMARY_LINE =
  '{"message_type":"summary","files_new":2,"files_changed":0,"files_unmodified":0,"dirs_new":8,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":2,"tree_blobs":9,"data_added":3851,"data_added_packed":2966,"total_files_processed":2,"total_bytes_processed":12,"total_duration":0.716071765,"backup_start":"2026-10-29T09:09:10.444930802+01:00","backup_end":"2026-10-29T09:09:11.161002555+01:00","snapshot_id":"28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b"}'
const STATUS_LINE =
  '{"message_type":"status","seconds_elapsed":1,"percent_done":0.684350835,"total_files":1,"total_bytes":400000000,"bytes_done":273740334,"current_files":["/data/blob"]}'
const WRONG_PASSWORD =
  '{"message_type":"exit_error","code":12,"message":"Fatal: wrong password or no key found"}'
const NO_REPOSITORY =
  '{"message_type":"exit_error","code":10,"message":"Fatal: repository does not exist: unable to open config file: stat /repo/config: no such file or directory\\nIs there a repository at the following location?\\n/repo"}'
const ALREADY_INITIALIZED =
  '{"message_type":"exit_error","code":1,"message":"Fatal: Fatal: create repository at /repo failed: config file already exists"}'
const UNREADABLE_FILE =
  '{"message_type":"error","error":{"message":"open /data/bad: permission denied"},"during":"archival","item":"/data/bad"}'
const PARTIAL_EXIT =
  '{"message_type":"exit_error","code":3,"message":"Warning: at least one source file could not be read"}'
const SNAPSHOTS_LINE =
  '[{"time":"2026-10-29T09:09:10.444930802+01:00","tree":"ba33","paths":["/stage"],"hostname":"torqvoice-org1","username":"nextjs","uid":1000,"gid":1000,"tags":["org:org1","manual"],"program_version":"restic 0.19.1","summary":{"backup_start":"2026-10-29T09:09:10.444930802+01:00","backup_end":"2026-10-29T09:09:11.161002555+01:00","files_new":2,"files_changed":0,"files_unmodified":0,"dirs_new":8,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":2,"tree_blobs":9,"data_added":3851,"data_added_packed":2966,"total_files_processed":2,"total_bytes_processed":12},"id":"28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b","short_id":"28891c8f"}]'
const STATS_LINE =
  '{"total_size":6928,"total_uncompressed_size":11714,"compression_ratio":1.6908198614318706,"compression_progress":100,"compression_space_saving":40.85709407546525,"total_blob_count":29,"snapshots_count":3}'
const FORGET_LINE =
  '[{"tags":["manual","org:org1"],"host":"torqvoice-org1","paths":null,"keep":[{"id":"9d6c","short_id":"9d6cb16e"}],"remove":[{"id":"2889","short_id":"28891c8f"}],"reasons":[]},{"tags":["org:org1"],"host":"torqvoice-org1","paths":null,"keep":[{"id":"9284","short_id":"92846caf"}],"remove":null,"reasons":[]}]'
const CHECK_LINE =
  '{"message_type":"summary","num_errors":0,"broken_packs":null,"suggest_repair_index":false,"suggest_prune":false}'
// From `restic --json restore <id> --target <dir>` on restic 0.19.1.
const RESTORE_STATUS_LINE =
  '{"message_type":"status","seconds_elapsed":0,"percent_done":0.5,"total_files":12,"files_restored":6,"total_bytes":19,"bytes_restored":9}'
const RESTORE_LINE =
  '{"message_type":"summary","total_files":12,"files_restored":12,"total_bytes":19,"bytes_restored":19}'
const VERSION_LINE =
  '{"message_type":"version","version":"0.19.1","go_version":"go1.26.4","go_os":"linux","go_arch":"amd64"}'

const root = mkdtempSync(path.join(tmpdir(), 'restic-test-'))
let cacheDir = ''
let scriptCount = 0
const savedEnv = { ...process.env }

/** Writes a fake restic that records its argv and env in $HOME, then runs `body`. */
function fakeRestic(body: string): void {
  const file = path.join(root, `restic-${++scriptCount}.sh`)
  writeFileSync(
    file,
    `#!/bin/sh\nrec="\${HOME:-${root}}"\nprintf '%s\\n' "$@" > "$rec/argv.txt"\n/usr/bin/env > "$rec/env.txt"\n${body}\n`
  )
  chmodSync(file, 0o755)
  process.env.RESTIC_BIN = file
}

function out(...lines: string[]): string {
  return `cat <<'EOF'\n${lines.join('\n')}\nEOF`
}

function err(...lines: string[]): string {
  return `cat >&2 <<'EOF'\n${lines.join('\n')}\nEOF`
}

function readChildEnv(dir = cacheDir): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path.join(dir, 'env.txt'), 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  // Variables the shell sets for itself.
  for (const key of ['PWD', 'OLDPWD', 'SHLVL', '_']) delete env[key]
  return env
}

function readChildArgv(): string[] {
  return readFileSync(path.join(cacheDir, 'argv.txt'), 'utf8').split('\n').slice(0, -1)
}

const repository: ResticRepository = {
  repository: 's3:https://s3.eu-central-1.amazonaws.com/workshop-bucket/torqvoice',
  env: { AWS_ACCESS_KEY_ID: 'theirs-id', AWS_SECRET_ACCESS_KEY: 'theirs-secret' },
  options: { 's3.region': 'eu-central-1' },
}

function base() {
  return { repository, password: 'correct horse battery', cacheDir }
}

beforeEach(() => {
  cacheDir = path.join(root, `cache-${scriptCount + 1}`)
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

describe('runRestic environment', () => {
  it('builds the child environment from scratch', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'ours'
    process.env.AWS_SECRET_ACCESS_KEY = 'ours'
    process.env.RESTIC_PASSWORD = 'ours'
    process.env.RESTIC_REPOSITORY = 'ours'
    process.env.DATABASE_URL = 'postgres://ours'
    fakeRestic('exit 0')

    await runRestic({ ...base(), args: ['snapshots'] })

    const env = readChildEnv()
    expect(env).toEqual({
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: cacheDir,
      TMPDIR: cacheDir,
      GOGC: '20',
      RESTIC_CACHE_DIR: cacheDir,
      RESTIC_REPOSITORY: repository.repository,
      RESTIC_PASSWORD: 'correct horse battery',
      AWS_ACCESS_KEY_ID: 'theirs-id',
      AWS_SECRET_ACCESS_KEY: 'theirs-secret',
    })
    expect(Object.values(env).some((v) => v.includes('ours'))).toBe(false)
  })

  it('does not let a destination override the password or path', async () => {
    fakeRestic('exit 0')
    await runRestic({
      ...base(),
      repository: {
        ...repository,
        env: { RESTIC_PASSWORD: 'other', RESTIC_PASSWORD_COMMAND: 'cat /etc/x', PATH: '/tmp' },
      },
      args: ['snapshots'],
    })
    const env = readChildEnv()
    expect(env.RESTIC_PASSWORD).toBe('correct horse battery')
    expect(env.PATH).toBe('/usr/local/bin:/usr/bin:/bin')
    expect(env.RESTIC_PASSWORD_COMMAND).toBeUndefined()
  })

  it('passes the repository and options on argv, never the password', async () => {
    fakeRestic('exit 0')
    await runRestic({ ...base(), args: ['snapshots', '--host', 'h'] })
    const argv = readChildArgv()
    expect(argv).toEqual([
      '--json',
      '--repo',
      repository.repository,
      '-o',
      's3.region=eu-central-1',
      'snapshots',
      '--host',
      'h',
    ])
    expect(argv.join(' ')).not.toContain('correct horse battery')
  })

  it('refuses to run without a password', async () => {
    fakeRestic('exit 0')
    await expect(runRestic({ ...base(), password: '', args: ['snapshots'] })).rejects.toThrow(
      /password/
    )
  })
})

describe('argv redaction', () => {
  it('hides secret option values and URL credentials', () => {
    expect(
      redactArgv([
        '--repo',
        'rest:https://user:pa55@backup.example.com/repo',
        '-o',
        's3.secret-key=shh',
        '-o',
        's3.region=eu',
        '--option=azure.access-token=tok',
        '-o',
        'b2.password=pw',
      ])
    ).toEqual([
      '--repo',
      'rest:https://***@backup.example.com/repo',
      '-o',
      's3.secret-key=***',
      '-o',
      's3.region=eu',
      '--option=azure.access-token=***',
      '-o',
      'b2.password=***',
    ])
  })

  it('puts the redacted command on a ResticError', async () => {
    fakeRestic(`${err(WRONG_PASSWORD)}\nexit 12`)
    const error = await runRestic({
      ...base(),
      repository: { ...repository, options: { 's3.secret-key': 'shh' } },
      args: ['snapshots'],
    }).catch((e) => e)
    expect(error).toBeInstanceOf(ResticError)
    expect(error.command).toContain('s3.secret-key=***')
    expect(error.command).not.toContain('shh')
    expect(error.command).not.toContain('correct horse battery')
    expect(readChildArgv()).toContain('s3.secret-key=shh')
  })
})

describe('JSON parsing', () => {
  it('splits JSON lines from text and drops status lines', async () => {
    fakeRestic(out(STATUS_LINE, 'plain text', SUMMARY_LINE))
    const seen: string[] = []
    const result = await runRestic({ ...base(), args: ['backup'], onLine: (l) => seen.push(l) })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('plain text\n')
    expect(result.json).toEqual([JSON.parse(SUMMARY_LINE)])
    expect(seen).toEqual([STATUS_LINE, 'plain text', SUMMARY_LINE])
  })

  it('reads the backup summary', async () => {
    fakeRestic(out(STATUS_LINE, SUMMARY_LINE))
    const summary = await resticBackup(base(), {
      paths: ['/stage', '/uploads/org1'],
      host: 'torqvoice-org1',
      tags: ['org:org1', 'manual'],
      exclude: ['*.tmp'],
    })
    expect(summary).toEqual({
      snapshotId: '28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b',
      filesNew: 2,
      filesChanged: 0,
      dataAdded: 3851,
      totalBytesProcessed: 12,
      totalFilesProcessed: 2,
      partial: false,
    })
    expect(readChildArgv().slice(5)).toEqual([
      'backup',
      '--host',
      'torqvoice-org1',
      '--tag',
      'org:org1',
      '--tag',
      'manual',
      '--exclude',
      '*.tmp',
      '--',
      '/stage',
      '/uploads/org1',
    ])
  })

  it('treats exit 3 on backup as a partial success', async () => {
    fakeRestic(`${out(SUMMARY_LINE)}\n${err(UNREADABLE_FILE, PARTIAL_EXIT)}\nexit 3`)
    const summary = await resticBackup(base(), { paths: ['/stage'], host: 'h', tags: [] })
    expect(summary.partial).toBe(true)
    expect(summary.snapshotId).toMatch(/^28891c8f/)
  })

  it('treats exit 3 on anything else as a failure', async () => {
    fakeRestic(`${err(PARTIAL_EXIT)}\nexit 3`)
    await expect(runRestic({ ...base(), args: ['snapshots'] })).rejects.toBeInstanceOf(ResticError)
  })

  it('reads snapshots, stats, forget and check', async () => {
    fakeRestic(out(SNAPSHOTS_LINE))
    expect(await resticSnapshots(base(), { host: 'torqvoice-org1', tags: ['org:org1'] })).toEqual([
      {
        id: '28891c8f448a3c36c2271f6dc4e03b08052265e671b6a8c438c9358a8a1e602b',
        shortId: '28891c8f',
        time: '2026-10-29T09:09:10.444930802+01:00',
        hostname: 'torqvoice-org1',
        tags: ['org:org1', 'manual'],
        paths: ['/stage'],
        summary: {
          filesNew: 2,
          filesChanged: 0,
          dataAdded: 3851,
          totalFilesProcessed: 2,
          totalBytesProcessed: 12,
        },
      },
    ])

    fakeRestic(out(STATS_LINE))
    expect(await resticStats(base(), { host: 'torqvoice-org1', tags: ['org:org1'] })).toEqual({
      totalSize: 6928,
      totalFileCount: null,
      snapshotsCount: 3,
    })
    expect(readChildArgv().slice(5)).toEqual([
      'stats',
      '--mode',
      'raw-data',
      '--host',
      'torqvoice-org1',
      '--tag',
      'org:org1',
    ])

    fakeRestic(out(FORGET_LINE))
    expect(
      await resticForget(base(), {
        host: 'torqvoice-org1',
        tags: ['org:org1', 'scheduled'],
        keepHourly: 0,
        keepDaily: 14,
        keepWeekly: 8,
        keepMonthly: 0,
        prune: true,
      })
    ).toEqual({ kept: 2, removed: 1 })
    expect(readChildArgv().slice(5)).toEqual([
      'forget',
      '--group-by',
      'host',
      '--host',
      'torqvoice-org1',
      '--tag',
      'org:org1,scheduled',
      '--keep-daily',
      '14',
      '--keep-weekly',
      '8',
      '--prune',
      '--max-unused',
      '10%',
    ])

    fakeRestic(out(CHECK_LINE))
    expect(await resticCheck(base(), { readDataSubset: '2%' })).toEqual({
      numErrors: 0,
      suggestRepairIndex: false,
      suggestPrune: false,
    })
    expect(readChildArgv().slice(5)).toEqual(['check', '--read-data-subset=2%'])
  })

  it('reads the version without a repository', async () => {
    process.env.RESTIC_PASSWORD = 'ours'
    fakeRestic(out(VERSION_LINE))
    expect(await resticVersion()).toBe('0.19.1')
    expect(readChildEnv(root)).toEqual({ PATH: '/usr/local/bin:/usr/bin:/bin' })
  })

  it('forgets nothing when every keep is 0, and only prunes', async () => {
    fakeRestic('exit 0')
    const none = { keepHourly: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 }
    expect(await resticForget(base(), { host: 'h', tags: [], ...none, prune: false })).toEqual({
      kept: 0,
      removed: 0,
    })
    expect(existsSync(path.join(cacheDir, 'argv.txt'))).toBe(false)
    await resticForget(base(), { host: 'h', tags: [], ...none, prune: true })
    expect(readChildArgv().slice(5)).toEqual(['prune', '--max-unused', '10%'])
  })

  it('forgets one snapshot by id', async () => {
    fakeRestic('exit 0')
    await resticForgetSnapshot(base(), '28891c8f')
    expect(readChildArgv().slice(5)).toEqual(['forget', '--', '28891c8f'])
    await expect(resticForgetSnapshot(base(), '--prune')).rejects.toThrow(/snapshot id/)
  })

  it('runs unlock without --remove-all', async () => {
    fakeRestic('exit 0')
    await resticUnlock(base())
    expect(readChildArgv().slice(5)).toEqual(['unlock'])
  })

  it('restores one snapshot into a target folder and reads the summary', async () => {
    fakeRestic(out(RESTORE_STATUS_LINE, RESTORE_LINE))
    const summary = await resticRestore(base(), { snapshotId: '28891c8f', target: '/tmp/out' })
    expect(readChildArgv().slice(5)).toEqual(['restore', '--target', '/tmp/out', '--', '28891c8f'])
    expect(summary).toEqual({ filesRestored: 12, bytesRestored: 19 })
    await expect(
      resticRestore(base(), { snapshotId: 'latest', target: '/tmp/out' })
    ).rejects.toThrow(/snapshot id/)
  })
})

describe('error mapping', () => {
  it('maps exit 12 to wrong_password', async () => {
    fakeRestic(`${err(WRONG_PASSWORD)}\nexit 12`)
    const error = await resticOpen(base()).catch((e) => e)
    expect(error).toBeInstanceOf(ResticError)
    expect(error.reason).toBe('wrong_password')
    expect(error.code).toBe(12)
    expect(error.message).toBe('Fatal: wrong password or no key found')
  })

  it('maps exit 10 to no_repository', async () => {
    fakeRestic(`${err(NO_REPOSITORY)}\nexit 10`)
    const error = await resticOpen(base()).catch((e) => e)
    expect(error.reason).toBe('no_repository')
    expect(error.message).toMatch(/^Fatal: repository does not exist/)
  })

  it('reads the config on a good open', async () => {
    fakeRestic(
      out(
        '{',
        '  "version": 2,',
        '  "id": "7f2af135",',
        '  "chunker_polynomial": "3cc4840466c787"',
        '}'
      )
    )
    expect(await resticOpen(base())).toEqual({ id: '7f2af135', version: 2 })
  })

  it('treats an initialised repository as success', async () => {
    fakeRestic(`${err(ALREADY_INITIALIZED)}\nexit 1`)
    expect(await resticInit(base())).toEqual({ created: false })
    expect(readChildArgv().slice(5)).toEqual(['init', '--repository-version', '2'])
  })

  it('keeps the last 2000 characters of stderr', async () => {
    fakeRestic(`head -c 5000 /dev/zero | tr '\\0' 'x' >&2\nexit 1`)
    const error = await runRestic({ ...base(), args: ['check'] }).catch((e) => e)
    expect(error.stderr).toHaveLength(2000)
    expect(error.reason).toBe('failed')
  })

  it('reports a missing binary', async () => {
    process.env.RESTIC_BIN = path.join(root, 'no-such-restic')
    const error = await runRestic({ ...base(), args: ['snapshots'] }).catch((e) => e)
    expect(error.reason).toBe('not_installed')
  })
})

describe('timeouts', () => {
  it('stops a run that takes too long', async () => {
    fakeRestic('exec sleep 30')
    const started = Date.now()
    const error = await runRestic({ ...base(), args: ['check'], timeoutMs: 200 }).catch((e) => e)
    expect(error).toBeInstanceOf(ResticError)
    expect(error.reason).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('kills a child that ignores SIGTERM', async () => {
    fakeRestic("trap '' TERM\nexec sleep 30")
    const started = Date.now()
    const error = await runRestic({
      ...base(),
      args: ['check'],
      timeoutMs: 200,
      killGraceMs: 300,
    }).catch((e) => e)
    expect(error.reason).toBe('timeout')
    expect(Date.now() - started).toBeGreaterThanOrEqual(500)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('stops on abort', async () => {
    fakeRestic('exec sleep 30')
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    const error = await runRestic({ ...base(), args: ['check'], signal: controller.signal }).catch(
      (e) => e
    )
    expect(error.reason).toBe('aborted')
  })
})

// Opt-in: RESTIC_REAL_BIN=/path/to/restic npx vitest run src/__tests__/lib/backup
const realBin = process.env.RESTIC_REAL_BIN
describe.runIf(realBin && existsSync(realBin))('real restic', () => {
  it('inits, backs up, lists, forgets and checks a local repository', async () => {
    process.env.RESTIC_BIN = realBin
    const work = mkdtempSync(path.join(root, 'real-'))
    const source = path.join(work, 'source')
    mkdirSync(path.join(source, 'a'), { recursive: true })
    writeFileSync(path.join(source, 'a', 'one.txt'), 'hello')
    writeFileSync(path.join(source, 'two.txt'), 'world')
    const opts = {
      repository: { repository: path.join(work, 'repo'), env: {} },
      password: 'real-test-password',
      cacheDir: path.join(work, 'cache'),
    }

    expect(await resticVersion()).toMatch(/^\d+\.\d+\.\d+/)

    const missing = await resticOpen(opts).catch((e) => e)
    expect(missing.reason).toBe('no_repository')

    expect(await resticInit(opts)).toEqual({ created: true })
    expect(await resticInit(opts)).toEqual({ created: false })
    expect((await resticOpen(opts)).version).toBe(2)

    const wrong = await resticOpen({ ...opts, password: 'nope' }).catch((e) => e)
    expect(wrong.reason).toBe('wrong_password')

    const target = { host: 'torqvoice-test', tags: ['org:test'] }
    const first = await resticBackup(opts, { paths: [source], ...target })
    expect(first.filesNew).toBe(2)
    expect(first.snapshotId).toMatch(/^[0-9a-f]{64}$/)
    writeFileSync(path.join(source, 'three.txt'), 'again')
    const second = await resticBackup(opts, { paths: [source], ...target })
    expect(second.filesNew).toBe(1)

    const snapshots = await resticSnapshots(opts, target)
    expect(snapshots.map((s) => s.id)).toEqual([first.snapshotId, second.snapshotId])
    expect(snapshots[0].tags).toEqual(['org:test'])

    const stats = await resticStats(opts, target)
    expect(stats.totalSize).toBeGreaterThan(0)
    expect(stats.snapshotsCount).toBe(2)

    const forgot = await resticForget(opts, {
      ...target,
      keepHourly: 0,
      keepDaily: 0,
      keepWeekly: 0,
      keepMonthly: 0,
      prune: false,
    })
    expect(forgot.removed).toBe(0)

    // keep-hourly 1 keeps only the newest of two snapshots taken in the same hour.
    const pruned = await resticForget(opts, {
      ...target,
      keepHourly: 1,
      keepDaily: 0,
      keepWeekly: 0,
      keepMonthly: 0,
      prune: true,
    })
    expect(pruned).toEqual({ kept: 1, removed: 1 })
    expect((await resticSnapshots(opts, target)).map((s) => s.id)).toEqual([second.snapshotId])

    const probeTarget = { host: 'torqvoice-test', tags: ['torqvoice-probe'] }
    const probe = await resticBackup(opts, { paths: [source], ...probeTarget })
    await resticForgetSnapshot(opts, probe.snapshotId)
    expect(await resticSnapshots(opts, probeTarget)).toEqual([])

    expect((await resticCheck(opts, { readDataSubset: '100%' })).numErrors).toBe(0)
    await resticUnlock(opts)
  }, 120_000)
})
