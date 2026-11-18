/**
 * @vitest-environment node
 *
 * The health route the container's HEALTHCHECK and uptime monitors call. A
 * 200 has to mean the app can do its job: the database answers in time,
 * uploads can be written and the background jobs are still firing. Anything
 * else is a 503 that names what failed.
 */
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ uploads: '', queryRaw: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { $queryRaw: (...args: unknown[]) => state.queryRaw(...args) },
}))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => state.uploads }))

import { markBackgroundJobsDisabled, recordBackgroundJobsBeat } from '@/lib/background-jobs'
import { startHeartbeat } from '@/lib/cron/heartbeat'
import { DATABASE_TIMEOUT_MS, JOBS_STALE_MS } from '@/lib/health'

type Body = { status: string; checks: Record<string, string> }

/** A fresh copy of the route each test, as a newly started server has. */
async function probe() {
  const { GET } = await import('@/app/api/v1/health/route')
  const response = await GET()
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Body,
  }
}

let tmp = ''

beforeEach(async () => {
  vi.resetModules()
  // What instrumentation leaves behind lives on globalThis; a test starts with none.
  delete (globalThis as { __torqvoiceBackgroundJobs?: unknown }).__torqvoiceBackgroundJobs
  state.queryRaw.mockReset().mockResolvedValue([{ ok: 1 }])
  tmp = await mkdtemp(path.join(tmpdir(), 'tv-health-'))
  state.uploads = path.join(tmp, 'uploads')
  await mkdir(state.uploads)
  recordBackgroundJobsBeat()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await chmod(state.uploads, 0o700).catch(() => undefined)
  await rm(tmp, { recursive: true, force: true })
})

describe('GET /api/v1/health', () => {
  it('answers 200 when everything works, and is never cached', async () => {
    const { status, headers, body } = await probe()
    expect(status).toBe(200)
    expect(body).toEqual({ status: 'ok', checks: { database: 'ok', storage: 'ok', jobs: 'ok' } })
    expect(headers.get('cache-control')).toBe('no-store')
  })

  it('answers 503 when the database refuses the connection', async () => {
    state.queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))
    const { status, body } = await probe()
    expect(status).toBe(503)
    expect(body.status).toBe('error')
    expect(body.checks.database).toBe('unreachable')
  })

  it('answers 503 within the time limit when the database hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    state.queryRaw.mockReturnValue(new Promise(() => undefined))
    const pending = probe()
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS)
    const { status, body } = await pending
    expect(status).toBe(503)
    expect(body.checks.database).toBe('timeout')
  })

  it('asks a hung database once however many probes come in, and recovers when it answers', async () => {
    // Each query that never comes back holds one of the app's ten pooled
    // connections, so a probe every fifteen seconds must not open a new one.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let answer: (value: unknown) => void = () => undefined
    state.queryRaw.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    for (let i = 0; i < 3; i++) {
      const pending = probe()
      await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS)
      expect((await pending).body.checks.database).toBe('timeout')
    }
    expect(state.queryRaw).toHaveBeenCalledTimes(1)

    answer([{ ok: 1 }])
    state.queryRaw.mockResolvedValue([{ ok: 1 }])
    const { status, body } = await probe()
    expect(status).toBe(200)
    expect(body.checks.database).toBe('ok')
  })

  it('is healthy before the first upload has made the uploads folder', async () => {
    state.uploads = path.join(tmp, 'data', 'uploads')
    const { status, body } = await probe()
    expect(status).toBe(200)
    expect(body.checks.storage).toBe('ok')
  })

  it.skipIf(process.getuid?.() === 0)('answers 503 when uploads cannot be written', async () => {
    await chmod(state.uploads, 0o500)
    const { status, body } = await probe()
    expect(status).toBe(503)
    expect(body.checks.storage).toBe('not_writable')
  })

  it.skipIf(process.getuid?.() === 0)(
    'answers 503 when the uploads folder is writable but cannot be entered',
    async () => {
      // Write without search (execute) permission: making a workshop's folder
      // inside it fails with EACCES, so uploads are broken.
      await chmod(state.uploads, 0o600)
      const { status, body } = await probe()
      expect(status).toBe(503)
      expect(body.checks.storage).toBe('not_writable')
    }
  )

  it('answers 503 when the background jobs never started', async () => {
    delete (globalThis as { __torqvoiceBackgroundJobs?: unknown }).__torqvoiceBackgroundJobs
    const { status, body } = await probe()
    expect(status).toBe(503)
    expect(body.checks.jobs).toBe('not_started')
  })

  it('answers 503 when the background jobs have stopped beating', async () => {
    recordBackgroundJobsBeat(Date.now() - JOBS_STALE_MS - 1000)
    const { status, body } = await probe()
    expect(status).toBe(503)
    expect(body.checks.jobs).toBe('stalled')
  })

  it('stays healthy with the background jobs switched off on purpose', async () => {
    markBackgroundJobsDisabled()
    const { status, body } = await probe()
    expect(status).toBe(200)
    expect(body.checks.jobs).toBe('disabled')
  })

  it('keeps reporting healthy while the heartbeat runs, long past the stale limit', async () => {
    vi.useFakeTimers()
    const job = startHeartbeat()
    await vi.advanceTimersByTimeAsync(JOBS_STALE_MS * 2)
    const { status, body } = await probe()
    job.stop()
    expect(status).toBe(200)
    expect(body.checks.jobs).toBe('ok')
  })

  it('logs one line when it starts failing and one when it recovers', async () => {
    state.queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))
    await probe()
    await probe()
    state.queryRaw.mockResolvedValue([{ ok: 1 }])
    await probe()
    await probe()

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('[health] failing: database=unreachable')
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith('[health] passing again')
  })
})
