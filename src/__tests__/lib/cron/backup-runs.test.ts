// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The backup scheduler against an in-memory database. The engine is a fake:
 * what the cron decides (which connection, when, in what order, retries and
 * alerts) is what is under test. The schedule maths is the real module, in
 * UTC.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  runs: [] as Row[],
  connections: new Map<string, Row>(),
  events: [] as string[],
  features: { backups: true, integrations: true } as Record<string, boolean>,
  manifests: {} as Record<string, Row | undefined>,
  lock: null as { runId: string; since: number } | null,
  outcome: {} as Record<string, string>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    backupRun: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        h.runs
          .filter((r) => r.status === where.status && r.startedAt < where.startedAt.lt)
          .map((r) => ({ id: r.id }))
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = h.runs.find((r) => r.id === where.id) as Row
        Object.assign(row, data)
        return row
      }),
    },
    integrationConnection: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        [...h.connections.values()]
          .filter((c) => where.status.in.includes(c.status))
          .map((c) => ({ ...c, state: { ...c.state } }))
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const c = h.connections.get(where.id)
        return c ? { ...c, state: { ...c.state } } : null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const c = h.connections.get(where.id) as Row
        if (data.state) {
          h.events.push(`state ${where.id} ${JSON.stringify(data.state)}`)
          c.state = data.state
        }
        return c
      }),
    },
  },
}))

vi.mock('@/lib/backup/engine', () => ({
  backupLockHolder: vi.fn(() => h.lock),
  queueBackupRun: vi.fn(async (connectionId: string, trigger: string) => {
    h.events.push(`queue ${connectionId} ${trigger}`)
    return { runId: `run-${connectionId}` }
  }),
  runBackup: vi.fn(async (runId: string) => {
    h.events.push(`start ${runId}`)
    await new Promise((r) => setTimeout(r, 5))
    h.events.push(`end ${runId}`)
    return { id: runId, status: h.outcome[runId] ?? 'done' }
  }),
  reportOverdue: vi.fn(async () => undefined),
}))

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) => h.manifests[id],
  listManifests: () => Object.values(h.manifests).filter(Boolean),
}))

vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => h.features),
  isCloudMode: () => false,
}))

vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))

import { failStaleRuns, processDueBackups } from '@/lib/cron/backup-runs'
import { queueBackupRun, reportOverdue, runBackup } from '@/lib/backup/engine'
import { getFeatures } from '@/lib/features'

const HOUR = 60 * 60 * 1000
const S3 = { id: 's3', name: 'S3', capabilities: ['backup.target'], plan: 'backups' }

function addConnection(id: string, over: Row = {}): Row {
  const row = {
    id,
    organizationId: `org${id}`,
    connectorId: 's3',
    status: 'active',
    settings: { frequency: 'daily', time: '02:00' },
    state: {},
    ...over,
  }
  h.connections.set(id, row)
  return row
}

function state(id: string): Row {
  return h.connections.get(id)?.state ?? {}
}

const t = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.clearAllMocks()
  h.runs = []
  h.connections.clear()
  h.events = []
  h.features = { backups: true, integrations: true }
  h.manifests = {
    s3: S3,
    calendar: { id: 'calendar', name: 'Cal', capabilities: ['calendar.sync'] },
  }
  h.lock = null
  h.outcome = {}
})

describe('failStaleRuns', () => {
  it('fails runs running for more than 8 hours, except the one this process holds', async () => {
    const now = t('2026-10-29T12:00:00Z')
    h.runs = [
      { id: 'stale', status: 'running', startedAt: t('2026-10-29T03:00:00Z') },
      { id: 'mine', status: 'running', startedAt: t('2026-10-29T02:00:00Z') },
      { id: 'fresh', status: 'running', startedAt: t('2026-10-29T05:00:00Z') },
      { id: 'old-done', status: 'done', startedAt: t('2026-10-28T02:00:00Z') },
    ]
    h.lock = { runId: 'mine', since: t('2026-10-29T02:00:00Z').getTime() }

    expect(await failStaleRuns(now)).toBe(1)

    const byId = Object.fromEntries(h.runs.map((r) => [r.id, r]))
    expect(byId.stale).toMatchObject({ status: 'failed', finishedAt: now })
    expect(byId.stale.error).toMatch(/did not finish/)
    expect(byId.mine.status).toBe('running')
    expect(byId.fresh.status).toBe('running')
    expect(byId['old-done'].status).toBe('done')
  })

  it('does nothing when no run is stale', async () => {
    h.runs = [{ id: 'fresh', status: 'running', startedAt: t('2026-10-29T11:00:00Z') }]
    expect(await failStaleRuns(t('2026-10-29T12:00:00Z'))).toBe(0)
    expect(h.runs[0].status).toBe('running')
  })
})

describe('processDueBackups, what runs', () => {
  const now = t('2026-10-29T02:01:00Z')
  const yesterday = { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' }

  it('runs a due connection and stamps lastScheduledAt before the run', async () => {
    addConnection('c1', { state: { ...yesterday } })

    expect(await processDueBackups(now)).toBe(1)

    expect(queueBackupRun).toHaveBeenCalledWith('c1', 'scheduled')
    expect(runBackup).toHaveBeenCalledWith('run-c1')
    const stamp = h.events.findIndex(
      (e) => e.startsWith('state c1') && e.includes(now.toISOString())
    )
    expect(stamp).toBeGreaterThanOrEqual(0)
    expect(stamp).toBeLessThan(h.events.indexOf('start run-c1'))
    expect(state('c1')['backup.lastScheduledAt']).toBe(now.toISOString())
  })

  it('also runs connections in error, but not disconnected ones', async () => {
    addConnection('c1', { status: 'error', state: { ...yesterday } })
    addConnection('c2', { status: 'disconnected', state: { ...yesterday } })
    await processDueBackups(now)
    expect(vi.mocked(queueBackupRun).mock.calls.map((c) => c[0])).toEqual(['c1'])
  })

  it('skips connectors without the backup capability', async () => {
    addConnection('c1', { connectorId: 'calendar', state: { ...yesterday } })
    addConnection('c2', { connectorId: 'gone', state: { ...yesterday } })
    expect(await processDueBackups(now)).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
    expect(getFeatures).not.toHaveBeenCalled()
    expect(state('c1')).toEqual(yesterday)
  })

  it('skips when the plan does not include backups', async () => {
    h.features = { backups: false, integrations: true }
    addConnection('c1', { state: { ...yesterday } })
    expect(await processDueBackups(now)).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
    expect(state('c1')).toEqual(yesterday)
  })

  it('does not run when not due', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-29T02:00:30.000Z' } })
    expect(await processDueBackups(t('2026-10-29T10:00:00Z'))).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('does not run a new connection until its first slot', async () => {
    addConnection('c1')
    expect(await processDueBackups(t('2026-10-29T10:00:00Z'))).toBe(0)
    expect(await processDueBackups(t('2026-10-30T02:03:00Z'))).toBe(1)
  })

  it('runs due connections one after the other', async () => {
    addConnection('c1', { state: { ...yesterday } })
    addConnection('c2', { state: { ...yesterday } })
    expect(await processDueBackups(now)).toBe(2)
    const runEvents = h.events.filter((e) => e.startsWith('start') || e.startsWith('end'))
    expect(runEvents).toEqual(['start run-c1', 'end run-c1', 'start run-c2', 'end run-c2'])
  })

  it('goes on with the next connection when one is already busy', async () => {
    addConnection('c1', { state: { ...yesterday } })
    addConnection('c2', { state: { ...yesterday } })
    vi.mocked(queueBackupRun).mockRejectedValueOnce(new Error('busy'))
    expect(await processDueBackups(now)).toBe(1)
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(runBackup).toHaveBeenCalledWith('run-c2')
  })
})

describe('processDueBackups, retry', () => {
  const now = t('2026-10-29T02:01:00Z')

  it('sets retryAt 30 minutes later after a failed scheduled run and clears it on the retry', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' } })
    h.outcome['run-c1'] = 'failed'

    await processDueBackups(now)
    const retryAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
    expect(state('c1')['backup.retryAt']).toBe(retryAt)

    // Not before the retry time.
    await processDueBackups(t('2026-10-29T02:25:00Z'))
    expect(runBackup).toHaveBeenCalledTimes(1)

    // The retry runs and fails again: no second retry.
    await processDueBackups(t('2026-10-29T02:31:00Z'))
    expect(runBackup).toHaveBeenCalledTimes(2)
    expect(state('c1')['backup.retryAt']).toBeNull()

    await processDueBackups(t('2026-10-29T03:31:00Z'))
    expect(runBackup).toHaveBeenCalledTimes(2)
  })

  it('a successful retry clears retryAt', async () => {
    addConnection('c1', {
      state: {
        'backup.lastScheduledAt': '2026-10-29T02:00:30.000Z',
        'backup.retryAt': '2026-10-29T02:30:30.000Z',
      },
    })
    await processDueBackups(t('2026-10-29T02:31:00Z'))
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(state('c1')['backup.retryAt']).toBeNull()
  })

  it('does not set a retry after a good run', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' } })
    await processDueBackups(now)
    expect(state('c1')['backup.retryAt']).toBeNull()
  })

  // Documents expected behaviour. A scheduled run that lands while a manual
  // run of another workshop holds the server-wide lock comes back 'skipped';
  // the cron has already stamped lastScheduledAt and only retries 'failed'
  // (backup-runs.ts:114), so that workshop has no backup until its next slot.
  it('retries a scheduled run that was skipped because another backup held the lock', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' } })
    h.outcome['run-c1'] = 'skipped'
    await processDueBackups(now)
    expect(state('c1')['backup.retryAt']).toBe(
      new Date(now.getTime() + 30 * 60 * 1000).toISOString()
    )
  })
})

describe('processDueBackups, overdue alert', () => {
  const now = t('2026-10-29T10:00:00Z')
  const notDue = {
    'backup.lastScheduledAt': '2026-10-29T02:00:30.000Z',
    'backup.firstScheduledAt': '2026-10-20T02:00:30.000Z',
  }

  it('reports once when no good backup exists for more than twice the interval', async () => {
    const lastGood = '2026-10-26T02:05:00.000Z'
    addConnection('c1', { state: { ...notDue, 'backup.lastGoodAt': lastGood } })

    await processDueBackups(now)
    expect(reportOverdue).toHaveBeenCalledTimes(1)
    expect(reportOverdue).toHaveBeenCalledWith('c1', 'orgc1', new Date(lastGood))
    expect(state('c1')['backup.lastOverdueAlertAt']).toBe(now.toISOString())

    await processDueBackups(t('2026-10-29T11:00:00Z'))
    await processDueBackups(t('2026-10-29T23:00:00Z'))
    expect(reportOverdue).toHaveBeenCalledTimes(1)
  })

  it('reports again 24 hours after the last alert', async () => {
    addConnection('c1', {
      state: {
        ...notDue,
        'backup.lastGoodAt': '2026-10-26T02:05:00.000Z',
        'backup.lastOverdueAlertAt': '2026-10-28T09:00:00.000Z',
      },
    })
    await processDueBackups(now)
    expect(reportOverdue).toHaveBeenCalledTimes(1)
  })

  it('does not report within twice the interval', async () => {
    addConnection('c1', { state: { ...notDue, 'backup.lastGoodAt': '2026-10-28T02:05:00.000Z' } })
    await processDueBackups(now)
    expect(reportOverdue).not.toHaveBeenCalled()
  })

  it('an hourly backup is not overdue before 3 hours', async () => {
    const hourly = { frequency: 'hourly' }
    const at = t('2026-10-29T10:30:00Z')
    addConnection('c1', {
      settings: hourly,
      state: {
        'backup.lastScheduledAt': '2026-10-29T10:00:30.000Z',
        'backup.firstScheduledAt': '2026-10-20T10:00:30.000Z',
        'backup.lastGoodAt': new Date(at.getTime() - 2.5 * HOUR).toISOString(),
      },
    })
    await processDueBackups(at)
    expect(reportOverdue).not.toHaveBeenCalled()

    h.connections.get('c1')!.state['backup.lastGoodAt'] = new Date(
      at.getTime() - 3.5 * HOUR
    ).toISOString()
    await processDueBackups(at)
    expect(reportOverdue).toHaveBeenCalledTimes(1)
  })

  it('never reports before the first scheduled run', async () => {
    addConnection('c1', { state: {} })
    await processDueBackups(now)
    expect(reportOverdue).not.toHaveBeenCalled()
  })

  it('a plan without backups gets no alert either', async () => {
    h.features = { backups: false, integrations: true }
    addConnection('c1', { state: { ...notDue, 'backup.lastGoodAt': '2026-10-20T02:05:00.000Z' } })
    await processDueBackups(now)
    expect(reportOverdue).not.toHaveBeenCalled()
  })

  // Documents expected behaviour. alertIfOverdue reads the state loaded at
  // the start of the tick (backup-runs.ts:88 and :120), so a run that just
  // succeeded is judged against the old lastGoodAt and the workshop is told
  // its backup is overdue minutes after a good one.
  it('does not report overdue right after a good run in the same tick', async () => {
    addConnection('c1', {
      state: {
        'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z',
        'backup.lastGoodAt': '2026-10-26T02:05:00.000Z',
      },
    })
    vi.mocked(runBackup).mockImplementationOnce(async (runId: string) => {
      // What the engine does on success: lastGoodAt in the connection state.
      h.connections.get('c1')!.state['backup.lastGoodAt'] = '2026-10-29T02:01:30.000Z'
      return { id: runId, status: 'done' } as never
    })
    await processDueBackups(t('2026-10-29T02:01:00Z'))
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(reportOverdue).not.toHaveBeenCalled()
  })

  // Documents expected behaviour. With no good backup ever, the reference is
  // BACKUP_STATE.lastScheduledAt (backup-runs.ts:136-140), which every
  // scheduled run moves forward, so it is never more than one interval old
  // and the overdue alert never fires for a destination that has never
  // worked.
  it('reports a destination that has failed every run since it was connected', async () => {
    addConnection('c1', { settings: { frequency: 'hourly' }, state: {} })
    h.outcome['run-c1'] = 'failed'
    const start = t('2026-10-29T10:00:00Z').getTime()
    for (let i = 0; i <= 12; i++) {
      await processDueBackups(new Date(start + i * 30 * 60 * 1000))
    }
    expect(vi.mocked(runBackup).mock.calls.length).toBeGreaterThan(5)
    expect(reportOverdue).toHaveBeenCalled()
  })
})
