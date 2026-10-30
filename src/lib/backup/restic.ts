import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import type { BackupSettings, ResticRepository } from '@/features/integrations/Lib/backup-types'
import { retentionFlags } from '@/lib/backup/schedule'

/**
 * Runs restic as a child process.
 *
 * The child gets an environment built from scratch: nothing from the server's
 * own environment (our database URL, our S3 keys, our RESTIC_* variables)
 * can reach it, so it can never write to or read from anything but the
 * workshop's own repository. The password goes in through the environment,
 * never on the command line, and neither is ever logged.
 *
 * Message shapes below are copied from restic 0.19.1 with `--json`.
 */

const DEFAULT_TIMEOUT_MS = 6 * 60 * 60_000
const KILL_GRACE_MS = 10_000
const STDERR_TAIL = 2000
/** Text kept from each stream; status lines on a long backup add up. */
const MAX_TEXT = 1_000_000

/** Keys the runner sets itself; a destination's env cannot override them. */
const OWN_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'GOGC',
  'RESTIC_REPOSITORY',
  'RESTIC_REPOSITORY_FILE',
  'RESTIC_PASSWORD',
  'RESTIC_PASSWORD_FILE',
  'RESTIC_PASSWORD_COMMAND',
  'RESTIC_CACHE_DIR',
])

export type ResticErrorReason =
  | 'wrong_password'
  | 'no_repository'
  | 'locked'
  | 'timeout'
  | 'aborted'
  | 'not_installed'
  | 'failed'

export class ResticError extends Error {
  readonly code: number
  readonly stderr: string
  readonly command: string
  readonly reason: ResticErrorReason

  constructor(opts: {
    message: string
    code: number
    stderr: string
    command: string
    reason: ResticErrorReason
  }) {
    super(opts.message)
    this.name = 'ResticError'
    this.code = opts.code
    this.stderr = opts.stderr.slice(-STDERR_TAIL)
    this.command = opts.command
    this.reason = opts.reason
  }
}

export function resticBinary(): string {
  return process.env.RESTIC_BIN || 'restic'
}

export interface ResticRunOptions {
  repository: ResticRepository
  password: string
  cacheDir: string
  args: string[]
  timeoutMs?: number
  onLine?: (line: string) => void
  signal?: AbortSignal
  /** Time between SIGTERM and SIGKILL on timeout or abort; tests shorten it. */
  killGraceMs?: number
}

export interface ResticRunResult {
  code: number
  /** Lines that are not JSON. */
  stdout: string
  stderr: string
  /** JSON lines from stdout, minus `status` progress messages. */
  json: unknown[]
}

/** The whole environment the child sees. */
export function resticEnv(
  repository: ResticRepository,
  password: string,
  cacheDir: string
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(repository.env)) {
    if (!OWN_ENV_KEYS.has(key)) env[key] = value
  }
  return {
    ...env,
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: cacheDir,
    RESTIC_REPOSITORY: repository.repository,
    RESTIC_PASSWORD: password,
    RESTIC_CACHE_DIR: cacheDir,
    GOGC: '20',
    TMPDIR: cacheDir,
  }
}

const SECRET_NAME = /key|secret|password|token/i

/** Drops credentials from a URL-like string: `rest:https://user:pass@host` → `rest:https://***@host`. */
function redactUrl(value: string): string {
  return value.replace(/(\/\/)[^/@\s]+@/g, '$1***@')
}

/**
 * The argv as it may be logged: `-o` values whose name looks secret are
 * replaced, and user info in URLs is dropped.
 */
export function redactArgv(argv: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ((arg === '-o' || arg === '--option') && i + 1 < argv.length) {
      out.push(arg, redactOption(argv[i + 1]))
      i++
      continue
    }
    if (arg.startsWith('--option=')) {
      out.push(`--option=${redactOption(arg.slice('--option='.length))}`)
      continue
    }
    out.push(redactUrl(arg))
  }
  return out
}

function redactOption(option: string): string {
  const eq = option.indexOf('=')
  if (eq < 0) return option
  const name = option.slice(0, eq)
  return SECRET_NAME.test(name) ? `${name}=***` : `${name}=${redactUrl(option.slice(eq + 1))}`
}

function optionFlags(options: Record<string, string> | undefined): string[] {
  const flags: string[] = []
  for (const [key, value] of Object.entries(options ?? {})) flags.push('-o', `${key}=${value}`)
  return flags
}

function parseJsonLine(line: string): unknown {
  const t = line.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

function messageType(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'message_type' in value) {
    const t = (value as { message_type: unknown }).message_type
    return typeof t === 'string' ? t : undefined
  }
  return undefined
}

/**
 * Errors arrive on stderr as JSON, for example
 * `{"message_type":"exit_error","code":12,"message":"Fatal: wrong password or no key found"}`.
 */
function exitErrorMessage(stderr: string): string | null {
  const lines = stderr.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = parseJsonLine(lines[i])
    if (messageType(parsed) === 'exit_error') {
      const message = (parsed as { message?: unknown }).message
      if (typeof message === 'string') return message
    }
  }
  return null
}

/**
 * restic's exit codes: 1 fatal, 3 backup could not read some files,
 * 10 no repository, 11 lock failed, 12 wrong password, 130 interrupted.
 */
function reasonFor(code: number, message: string): ResticErrorReason {
  if (code === 12 || /wrong password or no key found/i.test(message)) return 'wrong_password'
  if (
    code === 10 ||
    /repository does not exist|Is there a repository at the following location/i.test(message)
  ) {
    return 'no_repository'
  }
  if (code === 11 || /unable to create lock|repository is already locked/i.test(message)) {
    return 'locked'
  }
  return 'failed'
}

function appendCapped(current: string, add: string): string {
  const next = current + add
  return next.length > MAX_TEXT ? next.slice(-MAX_TEXT) : next
}

interface SpawnResult {
  code: number
  stdout: string
  stderr: string
  json: unknown[]
}

function spawnRestic(
  argv: string[],
  env: Record<string, string>,
  opts: {
    cwd?: string
    timeoutMs: number
    killGraceMs: number
    onLine?: (line: string) => void
    signal?: AbortSignal
  }
): Promise<SpawnResult> {
  const command = [resticBinary(), ...redactArgv(argv)].join(' ')

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(
        new ResticError({
          message: 'restic aborted',
          code: -1,
          stderr: '',
          command,
          reason: 'aborted',
        })
      )
      return
    }

    const child = spawn(resticBinary(), argv, {
      // A complete environment, not merged with process.env.
      env: env as NodeJS.ProcessEnv,
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutText = ''
    let stderr = ''
    let pending = ''
    const json: unknown[] = []
    let stopped: 'timeout' | 'aborted' | null = null
    let killTimer: NodeJS.Timeout | null = null

    const takeLine = (line: string) => {
      if (!line) return
      opts.onLine?.(line)
      const parsed = parseJsonLine(line)
      if (parsed === undefined) stdoutText = appendCapped(stdoutText, `${line}\n`)
      else if (messageType(parsed) !== 'status') json.push(parsed)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) takeLine(line.replace(/\r$/, ''))
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = appendCapped(stderr, chunk)
    })

    const stop = (why: 'timeout' | 'aborted') => {
      if (stopped) return
      stopped = why
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), opts.killGraceMs)
    }
    const timer = setTimeout(() => stop('timeout'), opts.timeoutMs)
    const onAbort = () => stop('aborted')
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const cleanup = () => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      opts.signal?.removeEventListener('abort', onAbort)
    }

    child.on('error', (err: NodeJS.ErrnoException) => {
      cleanup()
      reject(
        new ResticError({
          message:
            err.code === 'ENOENT'
              ? 'restic is not installed on this server'
              : 'restic did not start',
          code: -1,
          stderr: '',
          command,
          reason: err.code === 'ENOENT' ? 'not_installed' : 'failed',
        })
      )
    })

    child.on('close', (code, signal) => {
      cleanup()
      takeLine(pending.replace(/\r$/, ''))
      if (stopped) {
        reject(
          new ResticError({
            message: stopped === 'timeout' ? 'restic timed out' : 'restic aborted',
            code: code ?? -1,
            stderr,
            command,
            reason: stopped,
          })
        )
        return
      }
      resolve({ code: code ?? (signal ? 128 : -1), stdout: stdoutText, stderr, json })
    })
  })
}

/**
 * Runs `restic --json --repo <repository> [-o k=v ...] <args>`. A non-zero
 * exit throws a ResticError, except exit 3 on `backup` (some files could not
 * be read), which still made a snapshot and returns normally.
 */
export async function runRestic(opts: ResticRunOptions): Promise<ResticRunResult> {
  if (!opts.password) throw new Error('A restic repository password is required')
  const argv = [
    '--json',
    '--repo',
    opts.repository.repository,
    ...optionFlags(opts.repository.options),
    ...opts.args,
  ]
  await mkdir(opts.cacheDir, { recursive: true, mode: 0o700 })
  const result = await spawnRestic(argv, resticEnv(opts.repository, opts.password, opts.cacheDir), {
    cwd: opts.cacheDir,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    killGraceMs: opts.killGraceMs ?? KILL_GRACE_MS,
    onLine: opts.onLine,
    signal: opts.signal,
  })
  if (result.code === 0 || (result.code === 3 && opts.args[0] === 'backup')) return result

  const message =
    exitErrorMessage(result.stderr) ??
    result.stderr.trim().split('\n').pop() ??
    `restic exited with code ${result.code}`
  throw new ResticError({
    message: message || `restic exited with code ${result.code}`,
    code: result.code,
    stderr: result.stderr,
    command: [resticBinary(), ...redactArgv(argv)].join(' '),
    reason: reasonFor(result.code, message),
  })
}

export type ResticBaseOptions = Omit<ResticRunOptions, 'args'>

const withArgs = (opts: ResticBaseOptions, args: string[]): ResticRunOptions => ({ ...opts, args })

/**
 * `init --repository-version 2`. Prints
 * `{"message_type":"initialized","id":"7f2a…","repository":"…"}`; a second
 * init exits 1 with "…failed: config file already exists", which is fine.
 */
export async function resticInit(opts: ResticBaseOptions): Promise<{ created: boolean }> {
  try {
    await runRestic(withArgs(opts, ['init', '--repository-version', '2']))
    return { created: true }
  } catch (err) {
    if (
      err instanceof ResticError &&
      err.reason === 'failed' &&
      /config file already exists|already initialized/i.test(err.message)
    ) {
      return { created: false }
    }
    throw err
  }
}

/**
 * `cat config` proves the password opens the repository. Prints the config
 * pretty-printed: `{ "version": 2, "id": "…", "chunker_polynomial": "…" }`.
 * Wrong password: exit 12. No repository: exit 10 with
 * "Fatal: repository does not exist: unable to open config file: …".
 */
export async function resticOpen(
  opts: ResticBaseOptions
): Promise<{ id: string | null; version: number | null }> {
  const result = await runRestic(withArgs(opts, ['cat', 'config']))
  try {
    const config = JSON.parse(result.stdout) as { id?: unknown; version?: unknown }
    return {
      id: typeof config.id === 'string' ? config.id : null,
      version: typeof config.version === 'number' ? config.version : null,
    }
  } catch {
    return { id: null, version: null }
  }
}

export interface ResticBackupSummary {
  snapshotId: string
  filesNew: number
  filesChanged: number
  dataAdded: number
  totalBytesProcessed: number
  totalFilesProcessed: number
  /** Exit 3: the snapshot was made but some files could not be read. */
  partial: boolean
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * `backup`. The last stdout line is
 * `{"message_type":"summary","files_new":2,"files_changed":0,…,"data_added":3851,
 * "total_files_processed":2,"total_bytes_processed":12,…,"snapshot_id":"2889…"}`,
 * preceded by `status` lines while it runs. Unreadable files go to stderr as
 * `{"message_type":"error","error":{"message":"open …: permission denied"},…}`
 * and the run exits 3.
 */
export async function resticBackup(
  opts: ResticBaseOptions,
  input: { paths: string[]; host: string; tags: string[]; exclude?: string[] }
): Promise<ResticBackupSummary> {
  const args = ['backup', '--host', input.host]
  for (const tag of input.tags) args.push('--tag', tag)
  for (const pattern of input.exclude ?? []) args.push('--exclude', pattern)
  args.push('--', ...input.paths)

  const result = await runRestic(withArgs(opts, args))
  const summary = result.json.find((m) => messageType(m) === 'summary') as
    | Record<string, unknown>
    | undefined
  if (!summary || typeof summary.snapshot_id !== 'string') {
    throw new ResticError({
      message: 'restic backup finished without a snapshot',
      code: result.code,
      stderr: result.stderr,
      command: 'restic backup',
      reason: 'failed',
    })
  }
  return {
    snapshotId: summary.snapshot_id,
    filesNew: num(summary.files_new),
    filesChanged: num(summary.files_changed),
    dataAdded: num(summary.data_added),
    totalBytesProcessed: num(summary.total_bytes_processed),
    totalFilesProcessed: num(summary.total_files_processed),
    partial: result.code === 3,
  }
}

export type RetentionPolicy = Pick<
  BackupSettings,
  'keepHourly' | 'keepDaily' | 'keepWeekly' | 'keepMonthly'
>

/**
 * `forget --group-by host`. One group per workshop, whatever a snapshot's
 * other tags say (scheduled and manual runs count against the same policy).
 * Prints one line, an array of groups:
 * `[{"tags":[…],"host":"…","paths":null,"keep":[snapshot…],"remove":[snapshot…]|null,
 * "reasons":[…]}]`. With `--prune` nothing more reaches stdout.
 * All keeps at 0 is "Fatal: no policy was specified, no snapshots will be
 * removed" (exit 1), so nothing is forgotten then and only a prune runs.
 */
export async function resticForget(
  opts: ResticBaseOptions,
  input: RetentionPolicy & { host: string; tags: string[]; prune: boolean }
): Promise<{ kept: number; removed: number }> {
  const keepFlags = retentionFlags(input)
  if (keepFlags.length === 0) {
    if (input.prune) await runRestic(withArgs(opts, ['prune', '--max-unused', '10%']))
    return { kept: 0, removed: 0 }
  }
  const args = ['forget', '--group-by', 'host', '--host', input.host]
  if (input.tags.length) args.push('--tag', input.tags.join(','))
  args.push(...keepFlags)
  if (input.prune) args.push('--prune', '--max-unused', '10%')

  const result = await runRestic(withArgs(opts, args))
  let kept = 0
  let removed = 0
  const groups = result.json.find(Array.isArray) as
    | { keep?: unknown[] | null; remove?: unknown[] | null }[]
    | undefined
  for (const group of groups ?? []) {
    kept += group.keep?.length ?? 0
    removed += group.remove?.length ?? 0
  }
  return { kept, removed }
}

/** `forget <id>`: drops one snapshot, such as the probe a connection check makes. */
export async function resticForgetSnapshot(
  opts: ResticBaseOptions,
  snapshotId: string
): Promise<void> {
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) throw new Error('Invalid snapshot id')
  await runRestic(withArgs(opts, ['forget', '--', snapshotId]))
}

export interface ResticSnapshot {
  id: string
  shortId: string
  time: string
  tags: string[]
  paths: string[]
  summary?: {
    filesNew: number
    filesChanged: number
    dataAdded: number
    totalFilesProcessed: number
    totalBytesProcessed: number
  }
}

/**
 * `snapshots`. One line, an array (empty: `[]`):
 * `[{"time":"2026-10-29T09:09:10.44+01:00","tree":"…","paths":["…"],"hostname":"…",
 * "tags":["org:org1","manual"],"summary":{"files_new":2,…},"id":"2889…","short_id":"28891c8f"}]`.
 */
export async function resticSnapshots(
  opts: ResticBaseOptions,
  input: { host: string; tags: string[] }
): Promise<ResticSnapshot[]> {
  const args = ['snapshots', '--host', input.host]
  if (input.tags.length) args.push('--tag', input.tags.join(','))
  const result = await runRestic(withArgs(opts, args))
  const list = (result.json.find(Array.isArray) ?? []) as Record<string, unknown>[]
  return list.map((s) => {
    const summary = s.summary as Record<string, unknown> | undefined
    return {
      id: String(s.id ?? ''),
      shortId: String(s.short_id ?? ''),
      time: String(s.time ?? ''),
      tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
      paths: Array.isArray(s.paths) ? s.paths.map(String) : [],
      ...(summary
        ? {
            summary: {
              filesNew: num(summary.files_new),
              filesChanged: num(summary.files_changed),
              dataAdded: num(summary.data_added),
              totalFilesProcessed: num(summary.total_files_processed),
              totalBytesProcessed: num(summary.total_bytes_processed),
            },
          }
        : {}),
    }
  })
}

/**
 * `stats --mode raw-data`. Prints
 * `{"total_size":6928,"total_uncompressed_size":11714,"compression_ratio":1.69,…,
 * "total_blob_count":29,"snapshots_count":3}`, or `{"total_size":0,"snapshots_count":0}`
 * when nothing matches. Raw-data mode has no file count, so `totalFileCount`
 * is null unless restic sends one.
 */
export async function resticStats(
  opts: ResticBaseOptions,
  input: { host: string; tags: string[] }
): Promise<{ totalSize: number; totalFileCount: number | null; snapshotsCount: number }> {
  const args = ['stats', '--mode', 'raw-data', '--host', input.host]
  if (input.tags.length) args.push('--tag', input.tags.join(','))
  const result = await runRestic(withArgs(opts, args))
  const stats = (result.json.find((m) => m && typeof m === 'object' && !Array.isArray(m)) ??
    {}) as Record<string, unknown>
  return {
    totalSize: num(stats.total_size),
    totalFileCount: typeof stats.total_file_count === 'number' ? stats.total_file_count : null,
    snapshotsCount: num(stats.snapshots_count),
  }
}

/**
 * `check`. Prints
 * `{"message_type":"summary","num_errors":0,"broken_packs":null,"suggest_repair_index":false,"suggest_prune":false}`.
 */
export async function resticCheck(
  opts: ResticBaseOptions,
  input: { readDataSubset?: string } = {}
): Promise<{ numErrors: number; suggestRepairIndex: boolean; suggestPrune: boolean }> {
  const args = ['check']
  if (input.readDataSubset) args.push(`--read-data-subset=${input.readDataSubset}`)
  const result = await runRestic(withArgs(opts, args))
  const summary = (result.json.find((m) => messageType(m) === 'summary') ?? {}) as Record<
    string,
    unknown
  >
  return {
    numErrors: num(summary.num_errors),
    suggestRepairIndex: summary.suggest_repair_index === true,
    suggestPrune: summary.suggest_prune === true,
  }
}

/** `unlock` removes stale locks only; prints nothing with `--json`. */
export async function resticUnlock(opts: ResticBaseOptions): Promise<void> {
  await runRestic(withArgs(opts, ['unlock']))
}

/**
 * `version`, no repository. Prints
 * `{"message_type":"version","version":"0.19.1","go_version":"go1.26.4",…}`.
 */
export async function resticVersion(timeoutMs = 30_000): Promise<string> {
  const result = await spawnRestic(
    ['--json', 'version'],
    { PATH: '/usr/local/bin:/usr/bin:/bin' },
    {
      timeoutMs,
      killGraceMs: KILL_GRACE_MS,
    }
  )
  if (result.code !== 0) {
    throw new ResticError({
      message: exitErrorMessage(result.stderr) ?? `restic exited with code ${result.code}`,
      code: result.code,
      stderr: result.stderr,
      command: `${resticBinary()} --json version`,
      reason: 'failed',
    })
  }
  const message = result.json.find((m) => messageType(m) === 'version') as
    | { version?: unknown }
    | undefined
  if (typeof message?.version === 'string') return message.version
  const plain = /restic (\S+)/.exec(result.stdout)
  return plain ? plain[1] : result.stdout.trim()
}
