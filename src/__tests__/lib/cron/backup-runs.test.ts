// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The backup scheduler against an in-memory database. The engine is a fake:
 * what the cron decides (which repository is queued, when, retries, alerts,
 * the platform cycle's pause and purge) is what is under test. Running the
 * queued runs is the engine's drainBackupQueue, tested with the engine. The
 * schedule maths is the real module, in UTC.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  runs: [] as Row[],
  connections: new Map<string, Row>(),
  events: [] as string[],
  features: { backups: true, integrations: true } as Record<string, boolean>,
  /** Plan features per organisation, for the platform cycle; falls back to `features`. */
  orgFeatures: {} as Record<string, Record<string, boolean>>,
  manifests: {} as Record<string, Row | undefined>,
  lock: null as { runId: string; since: number } | null,
  organizations: [] as string[],
  /** PlatformBackup rows by organisation id. */
  platform: new Map<string, Row>(),
  platformConfig: null as Row | null,
  systemSettings: {} as Record<string, unknown>,
}))

/** The fields of a where clause the prune groups by. */
function sameGroup(r: Row, where: Row): boolean {
  return (
    r.organizationId === where.organizationId &&
    r.kind === where.kind &&
    r.connectionId === where.connectionId
  )
}

vi.mock('@/lib/db', () => ({
  db: {
    backupRun: {
      findMany: vi.fn(async (args: Row) => {
        const { where } = args
        // The prune's two reads: the repositories with aged rows, and the
        // row past a repository's newest hundred.
        if (args.distinct) {
          const seen = new Map<string, Row>()
          for (const r of h.runs.filter((r) => r.createdAt < where.createdAt.lt)) {
            const group = {
              organizationId: r.organizationId,
              kind: r.kind,
              connectionId: r.connectionId,
            }
            seen.set(JSON.stringify(group), group)
          }
          return [...seen.values()]
        }
        if (args.orderBy) {
          return h.runs
            .filter((r) => sameGroup(r, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? h.runs.length))
            .map((r) => ({ createdAt: r.createdAt }))
        }
        // failStaleRuns: running too long, or queued too long.
        return h.runs
          .filter((r) =>
            (where.OR as Row[]).some(
              (c) =>
                r.status === c.status &&
                (c.startedAt ? r.startedAt < c.startedAt.lt : r.createdAt < c.createdAt.lt)
            )
          )
          .map((r) => ({ id: r.id, status: r.status }))
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const gone = h.runs.filter(
          (r) =>
            sameGroup(r, where) &&
            r.createdAt < where.createdAt.lt &&
            r.createdAt <= where.createdAt.lte &&
            where.status.in.includes(r.status)
        )
        h.runs = h.runs.filter((r) => !gone.includes(r))
        return { count: gone.length }
      }),
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
    organization: {
      findMany: vi.fn(async () =>
        h.organizations.map((id) => ({
          id,
          platformBackup: h.platform.has(id) ? { ...h.platform.get(id) } : null,
        }))
      ),
    },
    platformBackup: {
      update: vi.fn(async ({ where, data }: { where: { organizationId: string }; data: Row }) => {
        const row = h.platform.get(where.organizationId) as Row
        Object.assign(row, data)
        h.events.push(`platform ${where.organizationId} ${Object.keys(data).join(',')}`)
        return row
      }),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { organizationId: string }; create: Row; update: Row }) => {
          const existing = h.platform.get(where.organizationId)
          const row = existing
            ? Object.assign(existing, update)
            : { createdAt: new Date(0), retryAt: null, pausedAt: null, purgedAt: null, ...create }
          h.platform.set(where.organizationId, row)
          h.events.push(`platform-upsert ${where.organizationId}`)
          return row
        }
      ),
    },
    systemSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        where.key in h.systemSettings ? { value: h.systemSettings[where.key] } : null
      ),
    },
  },
}))

vi.mock('@/lib/backup/engine', () => {
  class BackupBusyError extends Error {
    constructor() {
      super('A backup is already running')
    }
  }
  return {
    BackupBusyError,
    backupLockHolder: vi.fn(() => h.lock),
    drainBackupQueue: vi.fn(async () => 0),
    openPlatform: vi.fn(async (organizationId: string) => ({
      kind: 'platform',
      organizationId,
      base: { repository: { repository: `s3:platform/${organizationId}`, env: {} } },
    })),
    queueBackupRun: vi.fn(async (target: Row, trigger: string) => {
      const id = target.kind === 'platform' ? target.organizationId : target.connectionId
      h.events.push(`queue ${target.kind} ${id} ${trigger}`)
      return { runId: `run-${id}` }
    }),
    reportOverdue: vi.fn(async () => undefined),
  }
})

// Only whether platform backups are configured is faked; the rest of the
// module (plan check, grace period, host name) is the real one.
vi.mock('@/lib/backup/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/backup/platform')>()),
  platformBackupConfig: vi.fn(() => h.platformConfig),
}))

vi.mock('@/lib/backup/restic', () => ({
  resticSnapshots: vi.fn(async () => [
    { id: 'aaaaaaaa11111111', tags: [] },
    { id: 'bbbbbbbb22222222', tags: [] },
  ]),
  resticForgetSnapshots: vi.fn(async () => undefined),
}))

vi.mock('@/lib/email', () => ({ sendMail: vi.fn(async () => undefined) }))

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) => h.manifests[id],
  listManifests: () => Object.values(h.manifests).filter(Boolean),
}))

vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async (organizationId: string) => h.orgFeatures[organizationId] ?? h.features),
  isCloudMode: () => false,
}))

vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))

import {
  failStaleRuns,
  platformBackupFrequency,
  processDueBackups,
  processDuePlatformBackups,
  pruneOldRuns,
} from '@/lib/cron/backup-runs'
import {
  BackupBusyError,
  drainBackupQueue,
  openPlatform,
  queueBackupRun,
  reportOverdue,
} from '@/lib/backup/engine'
import { PAUSED_GRACE_MS } from '@/lib/backup/platform'
import { resticForgetSnapshots, resticSnapshots } from '@/lib/backup/restic'
import { getFeatures } from '@/lib/features'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
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

/** The destinations queued so far, by connection id. */
function queuedConnections(): string[] {
  return vi
    .mocked(queueBackupRun)
    .mock.calls.map((c) => (c[0] as { connectionId: string }).connectionId)
}

const t = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.clearAllMocks()
  h.runs = []
  h.connections.clear()
  h.events = []
  h.features = { backups: true, integrations: true }
  h.orgFeatures = {}
  h.manifests = {
    s3: S3,
    calendar: { id: 'calendar', name: 'Cal', capabilities: ['calendar.sync'] },
  }
  h.lock = null
  h.organizations = []
  h.platform.clear()
  h.platformConfig = null
  h.systemSettings = {}
})

describe('failStaleRuns', () => {
  it('fails runs running for more than 8 hours, except the one this process holds', async () => {
    const now = t('2026-10-29T12:00:00Z')
    const created = t('2026-10-29T01:00:00Z')
    h.runs = [
      { id: 'stale', status: 'running', startedAt: t('2026-10-29T03:00:00Z'), createdAt: created },
      { id: 'mine', status: 'running', startedAt: t('2026-10-29T02:00:00Z'), createdAt: created },
      { id: 'fresh', status: 'running', startedAt: t('2026-10-29T05:00:00Z'), createdAt: created },
      { id: 'old-done', status: 'done', startedAt: t('2026-10-28T02:00:00Z'), createdAt: created },
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

  it('fails runs queued for more than a day that nothing started, with their own message', async () => {
    const now = t('2026-10-29T12:00:00Z')
    h.runs = [
      { id: 'forgotten', status: 'queued', startedAt: null, createdAt: t('2026-10-28T11:00:00Z') },
      { id: 'waiting', status: 'queued', startedAt: null, createdAt: t('2026-10-29T02:00:00Z') },
    ]

    expect(await failStaleRuns(now)).toBe(1)

    const byId = Object.fromEntries(h.runs.map((r) => [r.id, r]))
    expect(byId.forgotten).toMatchObject({ status: 'failed', finishedAt: now })
    expect(byId.forgotten.error).toMatch(/never started/)
    expect(byId.waiting.status).toBe('queued')
  })

  it('does nothing when no run is stale', async () => {
    h.runs = [
      {
        id: 'fresh',
        status: 'running',
        startedAt: t('2026-10-29T11:00:00Z'),
        createdAt: t('2026-10-29T11:00:00Z'),
      },
    ]
    expect(await failStaleRuns(t('2026-10-29T12:00:00Z'))).toBe(0)
    expect(h.runs[0].status).toBe('running')
  })
})

describe('processDueBackups, what is queued', () => {
  const now = t('2026-10-29T02:01:00Z')
  const yesterday = { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' }

  it('queues a due connection and stamps lastScheduledAt before queueing', async () => {
    addConnection('c1', { state: { ...yesterday } })

    expect(await processDueBackups(now)).toBe(1)

    expect(queueBackupRun).toHaveBeenCalledWith(
      { kind: 'destination', connectionId: 'c1' },
      'scheduled'
    )
    const stamp = h.events.findIndex(
      (e) => e.startsWith('state c1') && e.includes(now.toISOString())
    )
    expect(stamp).toBeGreaterThanOrEqual(0)
    expect(stamp).toBeLessThan(h.events.indexOf('queue destination c1 scheduled'))
    expect(state('c1')['backup.lastScheduledAt']).toBe(now.toISOString())
    expect(state('c1')['backup.firstScheduledAt']).toBe(now.toISOString())
  })

  it('only queues; running the queue is left to drainBackupQueue', async () => {
    addConnection('c1', { state: { ...yesterday } })
    addConnection('c2', { state: { ...yesterday } })
    expect(await processDueBackups(now)).toBe(2)
    expect(queuedConnections()).toEqual(['c1', 'c2'])
    expect(drainBackupQueue).not.toHaveBeenCalled()
  })

  it('also queues connections in error, but not disconnected ones', async () => {
    addConnection('c1', { status: 'error', state: { ...yesterday } })
    addConnection('c2', { status: 'disconnected', state: { ...yesterday } })
    await processDueBackups(now)
    expect(queuedConnections()).toEqual(['c1'])
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

  it('does not queue when not due', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-29T02:00:30.000Z' } })
    expect(await processDueBackups(t('2026-10-29T10:00:00Z'))).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('does not queue a new connection until its first slot', async () => {
    addConnection('c1')
    expect(await processDueBackups(t('2026-10-29T10:00:00Z'))).toBe(0)
    expect(await processDueBackups(t('2026-10-30T02:03:00Z'))).toBe(1)
  })

  it('still queues while another run holds the server-wide lock', async () => {
    h.lock = { runId: 'someone-else', since: now.getTime() }
    addConnection('c1', { state: { ...yesterday } })
    expect(await processDueBackups(now)).toBe(1)
    expect(queuedConnections()).toEqual(['c1'])
  })

  it('counts a slot whose run is already queued or running as taken, without an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    addConnection('c1', { state: { ...yesterday } })
    addConnection('c2', { state: { ...yesterday } })
    vi.mocked(queueBackupRun).mockRejectedValueOnce(new BackupBusyError())

    expect(await processDueBackups(now)).toBe(1)

    expect(queuedConnections()).toEqual(['c1', 'c2'])
    expect(state('c1')['backup.lastScheduledAt']).toBe(now.toISOString())
    expect(state('c1')['backup.retryAt']).toBeNull()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('logs any other failure and goes on with the next connection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    addConnection('c1', { state: { ...yesterday } })
    addConnection('c2', { state: { ...yesterday } })
    vi.mocked(queueBackupRun).mockRejectedValueOnce(new Error('database went away'))

    expect(await processDueBackups(now)).toBe(1)

    expect(queuedConnections()).toEqual(['c1', 'c2'])
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('connection c1'),
      expect.any(Error)
    )
    error.mockRestore()
  })
})

describe('processDueBackups, retry', () => {
  it('queues the retry the engine booked once it is due, clears it, and keeps the slot', async () => {
    const slot = '2026-10-29T02:00:30.000Z'
    addConnection('c1', {
      state: { 'backup.lastScheduledAt': slot, 'backup.retryAt': '2026-10-29T02:30:30.000Z' },
    })

    // Not before the retry time.
    expect(await processDueBackups(t('2026-10-29T02:25:00Z'))).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()

    expect(await processDueBackups(t('2026-10-29T02:31:00Z'))).toBe(1)
    expect(state('c1')['backup.retryAt']).toBeNull()
    // A retry does not move the regular rhythm.
    expect(state('c1')['backup.lastScheduledAt']).toBe(slot)

    // Retried once: nothing more until the next slot.
    expect(await processDueBackups(t('2026-10-29T03:31:00Z'))).toBe(0)
    expect(queueBackupRun).toHaveBeenCalledTimes(1)
  })

  it('never books a retry itself; that is the engine\'s, after a failed scheduled run', async () => {
    addConnection('c1', { state: { 'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z' } })
    await processDueBackups(t('2026-10-29T02:01:00Z'))
    expect(state('c1')['backup.retryAt']).toBeNull()
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

  it('queues a due run and still reports an overdue destination in the same tick', async () => {
    addConnection('c1', {
      state: {
        'backup.lastScheduledAt': '2026-10-28T02:00:30.000Z',
        'backup.firstScheduledAt': '2026-10-20T02:00:30.000Z',
        'backup.lastGoodAt': '2026-10-25T02:05:00.000Z',
      },
    })
    expect(await processDueBackups(t('2026-10-29T02:01:00Z'))).toBe(1)
    expect(reportOverdue).toHaveBeenCalledTimes(1)
  })

  // With no good backup ever, the reference is firstScheduledAt, which the
  // scheduler stamps once, so a destination that has never worked is still
  // reported.
  it('reports a destination that has failed every run since it was connected', async () => {
    addConnection('c1', { settings: { frequency: 'hourly' }, state: {} })
    const start = t('2026-10-29T10:00:00Z').getTime()
    for (let i = 0; i <= 12; i++) {
      await processDueBackups(new Date(start + i * 30 * 60 * 1000))
    }
    expect(vi.mocked(queueBackupRun).mock.calls.length).toBeGreaterThan(5)
    expect(reportOverdue).toHaveBeenCalled()
  })
})

describe('platformBackupFrequency', () => {
  it('reads the system setting, hourly when it is unset or not one it knows', async () => {
    expect(await platformBackupFrequency()).toBe('hourly')
    h.systemSettings['platformBackup.frequency'] = 'every4h'
    expect(await platformBackupFrequency()).toBe('every4h')
    h.systemSettings['platformBackup.frequency'] = 'daily'
    expect(await platformBackupFrequency()).toBe('daily')
    h.systemSettings['platformBackup.frequency'] = 'weekly'
    expect(await platformBackupFrequency()).toBe('hourly')
  })
})

describe('processDuePlatformBackups', () => {
  // Hourly, at minute 0 (no spread off the cloud instance): a minute past.
  const now = t('2026-10-29T10:01:00Z')
  const CONFIG = { endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'b' }

  function addOrg(id: string, platformBackups: boolean, row?: Row): void {
    h.organizations.push(id)
    h.orgFeatures[id] = { backups: true, integrations: true, platformBackups }
    if (row) {
      h.platform.set(id, {
        organizationId: id,
        lastScheduledAt: null,
        lastGoodAt: null,
        lastOverdueAlertAt: null,
        retryAt: null,
        pausedAt: null,
        purgedAt: null,
        createdAt: new Date(now.getTime() - HOUR),
        ...row,
      })
    }
  }

  beforeEach(() => {
    h.platformConfig = CONFIG
  })

  it('does nothing when platform backups are not configured', async () => {
    h.platformConfig = null
    addOrg('orga', true)
    expect(await processDuePlatformBackups(now)).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
    expect(h.platform.size).toBe(0)
  })

  it('queues a workshop whose plan includes them, and makes its row with lastScheduledAt', async () => {
    addOrg('orga', true)

    expect(await processDuePlatformBackups(now)).toBe(1)

    expect(queueBackupRun).toHaveBeenCalledWith({ kind: 'platform', organizationId: 'orga' }, 'scheduled')
    expect(h.platform.get('orga')).toMatchObject({ organizationId: 'orga', lastScheduledAt: now })
    expect(h.events.indexOf('platform-upsert orga')).toBeLessThan(
      h.events.indexOf('queue platform orga scheduled')
    )
  })

  it('does not queue a workshop whose slot has not come round again', async () => {
    addOrg('orga', true, { lastScheduledAt: t('2026-10-29T10:00:30Z') })
    expect(await processDuePlatformBackups(t('2026-10-29T10:30:00Z'))).toBe(0)
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('pauses a workshop whose plan no longer includes them, and queues nothing', async () => {
    addOrg('orgb', false, { lastScheduledAt: t('2026-10-29T09:00:30Z') })

    expect(await processDuePlatformBackups(now)).toBe(0)

    expect(queueBackupRun).not.toHaveBeenCalled()
    expect(h.platform.get('orgb')?.pausedAt).toEqual(now)
    expect(h.platform.get('orgb')?.purgedAt).toBeNull()
    expect(openPlatform).not.toHaveBeenCalled()
  })

  it('leaves a workshop that never had them and is not allowed them alone', async () => {
    addOrg('orgc', false)
    expect(await processDuePlatformBackups(now)).toBe(0)
    expect(h.platform.has('orgc')).toBe(false)
  })

  it('keeps the repository of a paused workshop through the grace period', async () => {
    addOrg('orgb', false, { pausedAt: new Date(now.getTime() - PAUSED_GRACE_MS + DAY) })
    await processDuePlatformBackups(now)
    expect(openPlatform).not.toHaveBeenCalled()
    expect(resticForgetSnapshots).not.toHaveBeenCalled()
    expect(h.platform.get('orgb')?.purgedAt).toBeNull()
  })

  it('forgets every snapshot of a workshop paused longer than the grace period', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    addOrg('orgb', false, {
      pausedAt: new Date(now.getTime() - PAUSED_GRACE_MS - DAY),
      snapshots: [{ id: 'aaaaaaaa11111111' }],
      repositorySize: BigInt(1234),
    })

    expect(await processDuePlatformBackups(now)).toBe(0)

    expect(openPlatform).toHaveBeenCalledWith('orgb')
    expect(vi.mocked(resticSnapshots).mock.calls[0][1]).toEqual({ host: 'torqvoice-orgb', tags: [] })
    expect(vi.mocked(resticForgetSnapshots).mock.calls[0][1]).toEqual([
      'aaaaaaaa11111111',
      'bbbbbbbb22222222',
    ])
    const row = h.platform.get('orgb') as Row
    expect(row.purgedAt).toBeInstanceOf(Date)
    expect(row.snapshots).toEqual([])
    expect(row.repositorySize).toBe(BigInt(0))
    expect(queueBackupRun).not.toHaveBeenCalled()

    // Once purged, never again.
    vi.mocked(openPlatform).mockClear()
    await processDuePlatformBackups(new Date(now.getTime() + HOUR))
    expect(openPlatform).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('resumes a paused workshop whose plan includes them again', async () => {
    addOrg('orgb', true, {
      lastScheduledAt: t('2026-10-29T09:00:30Z'),
      pausedAt: new Date(now.getTime() - PAUSED_GRACE_MS - DAY),
      purgedAt: new Date(now.getTime() - DAY),
    })

    expect(await processDuePlatformBackups(now)).toBe(1)

    const row = h.platform.get('orgb') as Row
    expect(row.pausedAt).toBeNull()
    expect(row.purgedAt).toBeNull()
    expect(queueBackupRun).toHaveBeenCalledWith({ kind: 'platform', organizationId: 'orgb' }, 'scheduled')
  })

  it('goes on with the next workshop when one is already queued', async () => {
    addOrg('orga', true)
    addOrg('orgd', true)
    vi.mocked(queueBackupRun).mockRejectedValueOnce(new BackupBusyError())
    expect(await processDuePlatformBackups(now)).toBe(1)
    expect(queueBackupRun).toHaveBeenCalledTimes(2)
  })

  it('follows the frequency set for the platform cycle', async () => {
    h.systemSettings['platformBackup.frequency'] = 'daily'
    addOrg('orga', true, { lastScheduledAt: t('2026-10-29T02:00:30Z') })
    // Daily at 02:00: an hourly cycle would be due at ten, a daily one is not.
    expect(await processDuePlatformBackups(now)).toBe(0)
    expect(await processDuePlatformBackups(t('2026-10-30T02:01:00Z'))).toBe(1)
  })
})

describe('pruneOldRuns', () => {
  const now = t('2026-10-30T12:00:00Z')
  const addRuns = (
    group: { organizationId: string; kind: string; connectionId: string | null },
    n: number,
    ageDays: number,
    status = 'done'
  ) => {
    for (let i = 0; i < n; i++) {
      h.runs.push({
        id: `${group.organizationId}-${group.kind}-${group.connectionId}-${ageDays}-${i}-${status}`,
        ...group,
        status,
        startedAt: new Date(now.getTime() - ageDays * DAY - i * 1000),
        createdAt: new Date(now.getTime() - ageDays * DAY - i * 1000),
      })
    }
  }
  const dest = (connectionId: string, organizationId = 'org1') => ({
    organizationId,
    kind: 'destination',
    connectionId,
  })
  const platform = (organizationId: string) => ({ organizationId, kind: 'platform', connectionId: null })

  it('drops rows older than ninety days past the newest hundred, and never a running one', async () => {
    addRuns(dest('c1'), 120, 100) // all old: the newest hundred of them stay
    addRuns(dest('c1'), 1, 200, 'running')
    const gone = await pruneOldRuns(now)
    expect(gone).toBe(20)
    expect(h.runs.filter((r) => r.connectionId === 'c1').length).toBe(101)
    expect(h.runs.some((r) => r.status === 'running')).toBe(true)
  })

  it('keeps every row of the last ninety days, however many', async () => {
    addRuns(dest('c2'), 150, 10)
    addRuns(dest('c2'), 5, 100)
    expect(await pruneOldRuns(now)).toBe(5)
    expect(h.runs.length).toBe(150)
  })

  it('leaves a destination with nothing old alone', async () => {
    addRuns(dest('c3'), 30, 1)
    expect(await pruneOldRuns(now)).toBe(0)
    expect(h.runs.length).toBe(30)
  })

  it('counts the newest hundred per repository: each workshop\'s platform runs apart from its destinations', async () => {
    addRuns(platform('org1'), 60, 100)
    addRuns(platform('org2'), 60, 100)
    addRuns(dest('c1', 'org1'), 60, 100)
    // Together well over a hundred, each alone under: nothing goes.
    expect(await pruneOldRuns(now)).toBe(0)
    expect(h.runs.length).toBe(180)

    addRuns(platform('org1'), 50, 120)
    expect(await pruneOldRuns(now)).toBe(10)
    expect(h.runs.filter((r) => r.kind === 'platform' && r.organizationId === 'org1').length).toBe(100)
    expect(h.runs.filter((r) => r.organizationId === 'org2').length).toBe(60)
    expect(h.runs.filter((r) => r.kind === 'destination').length).toBe(60)
  })
})
