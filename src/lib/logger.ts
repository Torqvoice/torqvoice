/**
 * The server's log lines, as `docker logs` shows them.
 *
 * Every line is one line: `[scope] message key=value ...`, no timestamp
 * (Docker adds one), objects flattened, so a `grep` for a workshop id or a
 * scope finds the whole event. `LOG_LEVEL` picks how much is said: `error`,
 * `warn`, `info` (the default) or `debug`. Routine successes of recurring
 * jobs are `debug`; at `info` they arrive as an hourly roll-up instead (see
 * `createRollup`). Failures are `error` and always print.
 *
 * Never pass customer data, secrets or tokens as fields; ids are fine.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }

export type LogFields = Record<string, unknown>

/** The level set by LOG_LEVEL, read on every call so a test or a restart changes it. */
export function logLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase()
  return raw && raw in RANK ? (raw as LogLevel) : 'info'
}

export function logEnabled(level: LogLevel): boolean {
  return RANK[level] <= RANK[logLevel()]
}

const PLAIN = /^[^\s"=\\]+$/

function scalar(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'invalid-date' : value.toISOString()
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = typeof value === 'string' ? value : safeJson(value)
  // Quoted and escaped whenever it has a space, a quote or a line break, so
  // a message from a library can never start a second line.
  return text !== '' && PLAIN.test(text) ? text : JSON.stringify(text)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? ''
  } catch {
    return String(value)
  }
}

/** One error as fields: its message, its code when it has one, and the stack at debug. */
function errorFields(prefix: string, err: unknown): LogFields {
  if (!(err instanceof Error)) return { [prefix]: err }
  const out: LogFields = { [prefix]: err.message || err.name }
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' || typeof code === 'number') out[`${prefix}Code`] = code
  if (logEnabled('debug') && err.stack) out[`${prefix}Stack`] = err.stack
  return out
}

function flatten(fields: LogFields, prefix = '', out: string[] = [], depth = 0): string[] {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    const name = prefix ? `${prefix}.${key}` : key
    if (value instanceof Error) {
      for (const [k, v] of Object.entries(errorFields(name, value))) out.push(`${k}=${scalar(v)}`)
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      depth < 2
    ) {
      flatten(value as LogFields, name, out, depth + 1)
    } else {
      out.push(`${name}=${scalar(value)}`)
    }
  }
  return out
}

/** The line as it is printed. Exported for tests and for anything that must match it. */
export function formatLine(scope: string, message: string, fields?: LogFields): string {
  const parts = [`[${scope}]`, oneLine(message)]
  if (fields) parts.push(...flatten(fields))
  return parts.join(' ')
}

function oneLine(text: string): string {
  return text.replace(/\r?\n\s*/g, ' ')
}

function write(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  if (!logEnabled(level)) return
  const line = formatLine(scope, message, fields)
  // Biome allows warn and error only; both reach `docker logs`.
  if (level === 'error') console.error(line)
  else console.warn(line)
}

export interface Logger {
  error(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  debug(message: string, fields?: LogFields): void
}

export function createLogger(scope: string): Logger {
  return {
    error: (message, fields) => write('error', scope, message, fields),
    warn: (message, fields) => write('warn', scope, message, fields),
    info: (message, fields) => write('info', scope, message, fields),
    debug: (message, fields) => write('debug', scope, message, fields),
  }
}

const HOUR_MS = 60 * 60 * 1000

/**
 * A periodic total for a recurring job, at `info`: the job reports every
 * tick (zeros included, so the total goes out on time), and once an interval
 * has passed one line says what happened, e.g. `[cron] Backups: 14 finished,
 * 0 failed over the last 60 min`. Nothing at all when every count was zero.
 * The per-tick detail belongs at `debug`; failures are logged where they
 * happen, never only here.
 */
export function createRollup(
  scope: string,
  label: string,
  options: { intervalMs?: number; order?: string[] } = {}
) {
  const intervalMs = options.intervalMs ?? HOUR_MS
  let counts: Record<string, number> = {}
  let since = Date.now()
  const log = createLogger(scope)
  return {
    add(tick: Record<string, number>) {
      for (const [key, n] of Object.entries(tick)) {
        if (n > 0) counts[key] = (counts[key] ?? 0) + n
      }
      if (Date.now() - since < intervalMs) return
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      if (total > 0) {
        const keys = [
          ...(options.order ?? []),
          ...Object.keys(counts).filter((k) => !options.order?.includes(k)),
        ]
        const minutes = Math.round((Date.now() - since) / 60_000)
        const what = keys.map((k) => `${counts[k] ?? 0} ${k}`).join(', ')
        log.info(`${label}: ${what} over the last ${minutes} min`)
      }
      counts = {}
      since = Date.now()
    },
  }
}
