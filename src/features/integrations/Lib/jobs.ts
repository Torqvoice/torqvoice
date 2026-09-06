/**
 * The job queue.
 *
 * Connector work is a row in integration_jobs. The cron claims due rows
 * atomically, runs the connector's handler, and either marks them done or
 * schedules a retry with backoff. Five failures in a row park the job as
 * dead and put the connection into error, which is what the settings page
 * and the sidebar badge show.
 *
 * An idempotency key coalesces pending work: three edits to one work order
 * in a minute queue one push, not three. The key is cleared when the job
 * runs so the next edit queues again.
 */

import { db } from '@/lib/db'
import { getManifest } from '@/integrations/registry'
import { loadConnection, setConnectionStatus, writeLog } from './connections'

const STUCK_RUNNING_MS = 10 * 60 * 1000
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 21_600]

export interface EnqueueInput {
  connectionId: string
  organizationId: string
  kind: string
  payload?: Record<string, unknown>
  idempotencyKey?: string
  runAfter?: Date
  maxAttempts?: number
}

export async function enqueueJob(input: EnqueueInput): Promise<string | null> {
  const payload = input.payload ? (JSON.parse(JSON.stringify(input.payload)) as object) : undefined
  if (input.idempotencyKey) {
    const existing = await db.integrationJob.findUnique({
      where: {
        connectionId_idempotencyKey: {
          connectionId: input.connectionId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true, status: true },
    })
    if (existing) {
      // Already waiting: refresh the payload and let the queued run carry it.
      await db.integrationJob.update({
        where: { id: existing.id },
        data: { payload, ...(input.runAfter && { runAfter: input.runAfter }) },
      })
      return existing.id
    }
  }
  const job = await db.integrationJob.create({
    data: {
      connectionId: input.connectionId,
      organizationId: input.organizationId,
      kind: input.kind,
      payload,
      idempotencyKey: input.idempotencyKey ?? null,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
    },
    select: { id: true },
  })
  return job.id
}

async function claim(jobId: string): Promise<boolean> {
  const r = await db.integrationJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: {
      status: 'running',
      lockedAt: new Date(),
      startedAt: new Date(),
      // Released so a change arriving during the run queues a fresh job.
      idempotencyKey: null,
    },
  })
  return r.count === 1
}

export async function runJob(jobId: string): Promise<void> {
  if (!(await claim(jobId))) return
  const job = await db.integrationJob.findUnique({ where: { id: jobId } })
  if (!job) return

  let loaded: Awaited<ReturnType<typeof loadConnection>>
  try {
    loaded = await loadConnection(job.connectionId, { jobId })
  } catch (err) {
    await db.integrationJob.update({
      where: { id: jobId },
      data: {
        status: 'dead',
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    })
    return
  }
  if (loaded.status !== 'active' && loaded.status !== 'error') {
    await db.integrationJob.update({
      where: { id: jobId },
      data: { status: 'failed', finishedAt: new Date(), error: `Connection is ${loaded.status}` },
    })
    return
  }

  const handler = loaded.server.jobs[job.kind]
  if (!handler) {
    await db.integrationJob.update({
      where: { id: jobId },
      data: { status: 'dead', finishedAt: new Date(), error: `Unknown job ${job.kind}` },
    })
    return
  }

  try {
    const outcome = await handler(loaded.ctx, (job.payload as Record<string, unknown>) ?? {})
    await db.integrationJob.update({
      where: { id: jobId },
      data: {
        status: 'done',
        finishedAt: new Date(),
        attempts: job.attempts + 1,
        error: null,
      },
    })
    await db.integrationConnection.update({
      where: { id: job.connectionId },
      data: {
        lastSyncAt: new Date(),
        ...(loaded.status === 'error' && { status: 'active', lastError: null }),
      },
    })
    if (outcome?.summary)
      await writeLog(job.connectionId, 'info', `${job.kind}: ${outcome.summary}`, undefined, jobId)
    if (outcome?.rescheduleInSeconds) {
      await enqueueJob({
        connectionId: job.connectionId,
        organizationId: job.organizationId,
        kind: job.kind,
        payload: (job.payload as Record<string, unknown>) ?? undefined,
        runAfter: new Date(Date.now() + outcome.rescheduleInSeconds * 1000),
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const attempts = job.attempts + 1
    const dead = attempts >= job.maxAttempts
    const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
    await db.integrationJob.update({
      where: { id: jobId },
      data: {
        status: dead ? 'dead' : 'queued',
        attempts,
        error: message.slice(0, 1000),
        finishedAt: dead ? new Date() : null,
        runAfter: dead ? undefined : new Date(Date.now() + backoff * 1000),
        lockedAt: null,
      },
    })
    await writeLog(
      job.connectionId,
      dead ? 'error' : 'warn',
      `${job.kind} failed${dead ? '' : `, retry in ${Math.round(backoff / 60)} min`}: ${message}`,
      { attempt: attempts },
      jobId
    )
    if (dead) await setConnectionStatus(job.connectionId, 'error', message.slice(0, 500))
  }
}

/** Jobs left running by a crashed worker go back to the queue. */
export async function recoverStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_RUNNING_MS)
  const r = await db.integrationJob.updateMany({
    where: { status: 'running', lockedAt: { lt: cutoff } },
    data: { status: 'queued', lockedAt: null, runAfter: new Date() },
  })
  return r.count
}

export async function runDueJobs(limit = 50): Promise<number> {
  const due = await db.integrationJob.findMany({
    where: { status: 'queued', runAfter: { lte: new Date() } },
    orderBy: { runAfter: 'asc' },
    take: limit,
    select: { id: true },
  })
  for (const job of due) {
    try {
      await runJob(job.id)
    } catch (err) {
      console.error('[integrations] job runner failed:', err)
    }
  }
  return due.length
}

/**
 * Enqueue every scheduled job whose interval has elapsed for every active
 * connection. The last run time lives in the connection's state so a
 * restart does not fire everything at once.
 */
export async function scheduleDueSyncs(): Promise<number> {
  const connections = await db.integrationConnection.findMany({
    where: { status: 'active' },
    select: { id: true, organizationId: true, connectorId: true, state: true },
  })
  let queued = 0
  for (const c of connections) {
    const manifest = getManifest(c.connectorId)
    if (!manifest?.schedules?.length) continue
    const state = (c.state as Record<string, unknown>) ?? {}
    const lastRuns = (state.scheduleRuns as Record<string, number>) ?? {}
    const now = Date.now()
    let changed = false
    for (const s of manifest.schedules) {
      const last = lastRuns[s.job] ?? 0
      if (now - last < s.everyMinutes * 60_000) continue
      await enqueueJob({
        connectionId: c.id,
        organizationId: c.organizationId,
        kind: s.job,
        idempotencyKey: `schedule:${s.job}`,
      })
      lastRuns[s.job] = now
      changed = true
      queued++
    }
    if (changed) {
      await db.integrationConnection.update({
        where: { id: c.id },
        data: { state: { ...state, scheduleRuns: lastRuns } as object },
      })
    }
  }
  return queued
}

export async function cleanupIntegrationHistory(): Promise<{ jobs: number; logs: number }> {
  const logCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const jobCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [logs, jobs] = await Promise.all([
    db.integrationLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
    db.integrationJob.deleteMany({
      where: { status: { in: ['done', 'failed', 'dead'] }, finishedAt: { lt: jobCutoff } },
    }),
  ])
  return { jobs: jobs.count, logs: logs.count }
}
