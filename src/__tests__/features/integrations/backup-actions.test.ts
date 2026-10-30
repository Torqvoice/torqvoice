// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  connections: [] as Row[],
  features: { backups: true, integrations: true } as Record<string, boolean>,
  manifests: {} as Record<string, Row | undefined>,
}))

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org1', userId: 'user1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message, name: (error as Error).name }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    integrationConnection: {
      findUnique: vi.fn(
        async ({ where }: { where: { organizationId_connectorId: Row } }) =>
          h.connections.find(
            (c) =>
              c.organizationId === where.organizationId_connectorId.organizationId &&
              c.connectorId === where.organizationId_connectorId.connectorId
          ) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        h.connections.filter(
          (c) => c.organizationId === where.organizationId && where.status.in.includes(c.status)
        )
      ),
    },
  },
}))

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) => h.manifests[id],
  listManifests: () => Object.values(h.manifests).filter(Boolean),
}))

vi.mock('@/lib/features', async () => {
  class FeatureGatedError extends Error {
    feature: string
    constructor(feature: string, message?: string) {
      super(message)
      this.name = 'FeatureGatedError'
      this.feature = feature
    }
  }
  return {
    FeatureGatedError,
    getFeatures: vi.fn(async () => h.features),
    isCloudMode: () => false,
  }
})

// The names and sentences come out as their keys here; what is under test
// is who gets told, not the wording.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))

vi.mock('@/lib/backup/engine', () => {
  class BackupBusyError extends Error {}
  return {
    BackupBusyError,
    queueBackupRun: vi.fn(async () => ({ runId: 'run1' })),
    // A first backup can take an hour: the drain never settles here.
    drainBackupQueue: vi.fn(() => new Promise(() => undefined)),
  }
})

import { listBackupDestinations, runBackupNow } from '@/features/integrations/Actions/backupActions'
import { BackupBusyError, drainBackupQueue, queueBackupRun } from '@/lib/backup/engine'

const S3 = { id: 's3', name: 'S3 storage', capabilities: ['backup.target'], plan: 'backups' }
const LOCAL = {
  id: 'local-folder',
  name: 'Local folder',
  capabilities: ['backup.target'],
  plan: 'backups',
}
const CALENDAR = { id: 'google-calendar', name: 'Google Calendar', capabilities: ['calendar.sync'] }

beforeEach(() => {
  vi.clearAllMocks()
  h.features = { backups: true, integrations: true }
  h.manifests = { s3: S3, 'local-folder': LOCAL, 'google-calendar': CALENDAR }
  h.connections = [
    {
      id: 'conn-s3',
      organizationId: 'org1',
      connectorId: 's3',
      status: 'active',
      settings: { frequency: 'daily', time: '02:00' },
      state: {
        'backup.lastScheduledAt': '2026-10-29T02:00:30.000Z',
        'backup.lastGoodAt': '2026-10-29T02:04:00.000Z',
      },
      lastError: null,
    },
  ]
})

describe('runBackupNow', () => {
  it('refuses a connector that is not a backup destination', async () => {
    h.connections.push({
      id: 'cal',
      organizationId: 'org1',
      connectorId: 'google-calendar',
      status: 'active',
    })
    const result = await runBackupNow('google-calendar')
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/not a backup/) })
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('refuses an unknown connector', async () => {
    const result = await runBackupNow('nope')
    expect(result.success).toBe(false)
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('refuses when the plan lacks backups', async () => {
    h.features = { backups: false, integrations: true }
    const result = (await runBackupNow('s3')) as Row
    expect(result.success).toBe(false)
    expect(result.name).toBe('FeatureGatedError')
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('refuses when the destination is not connected', async () => {
    const result = await runBackupNow('local-folder')
    expect(result).toMatchObject({ success: false, error: 'Connect the destination first' })

    h.connections.push({
      id: 'conn-local',
      organizationId: 'org1',
      connectorId: 'local-folder',
      status: 'disconnected',
    })
    expect(await runBackupNow('local-folder')).toMatchObject({ success: false })
    expect(queueBackupRun).not.toHaveBeenCalled()
  })

  it('accepts a destination in error, so the workshop can try again', async () => {
    h.connections[0].status = 'error'
    expect(await runBackupNow('s3')).toMatchObject({ success: true, data: { runId: 'run1' } })
  })

  it('queues the run in the member\'s name and returns its id without waiting for it', async () => {
    // The drain never settles; the action must still return.
    const result = await runBackupNow('s3')
    expect(result).toEqual({ success: true, data: { runId: 'run1' } })
    expect(queueBackupRun).toHaveBeenCalledWith(
      { kind: 'destination', connectionId: 'conn-s3' },
      'manual',
      { requestedBy: 'user1' }
    )
    expect(drainBackupQueue).toHaveBeenCalledTimes(1)
    expect(vi.mocked(queueBackupRun).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(drainBackupQueue).mock.invocationCallOrder[0]
    )
  })

  it('says a backup is already running when one is queued', async () => {
    vi.mocked(queueBackupRun).mockRejectedValueOnce(new BackupBusyError())
    expect(await runBackupNow('s3')).toMatchObject({
      success: false,
      error: 'A backup is already running.',
    })
    expect(drainBackupQueue).not.toHaveBeenCalled()
  })
})

describe('listBackupDestinations', () => {
  it('returns only backup connectors, with the next run time', async () => {
    h.connections.push(
      {
        id: 'cal',
        organizationId: 'org1',
        connectorId: 'google-calendar',
        status: 'active',
        settings: {},
        state: {},
        lastError: null,
      },
      {
        id: 'conn-local',
        organizationId: 'org1',
        connectorId: 'local-folder',
        status: 'error',
        settings: { frequency: 'weekly', time: '03:00', weekday: '1' },
        state: {},
        lastError: 'Storage refused the request',
      },
      {
        id: 'other-org',
        organizationId: 'org2',
        connectorId: 's3',
        status: 'active',
        settings: {},
        state: {},
        lastError: null,
      }
    )

    const result = await listBackupDestinations()
    expect(result.success).toBe(true)
    const list = (result as { data: Row[] }).data
    expect(list.map((d) => d.connectorId)).toEqual(['s3', 'local-folder'])

    expect(list[0]).toEqual({
      connectorId: 's3',
      name: 'S3 storage',
      status: 'active',
      lastGood: '2026-10-29T02:04:00.000Z',
      nextRunAt: '2026-10-30T02:00:00.000Z',
      lastError: null,
    })
    expect(list[1]).toMatchObject({
      connectorId: 'local-folder',
      name: 'Local folder',
      status: 'error',
      lastGood: null,
      lastError: 'Storage refused the request',
    })
    // Weekly on Monday at 03:00 UTC, after now.
    const next = new Date(list[1].nextRunAt)
    expect(next.getTime()).toBeGreaterThan(Date.now())
    expect(next.getUTCDay()).toBe(1)
    expect(next.toISOString().slice(11, 16)).toBe('03:00')
  })

  it('returns an empty list when nothing is connected', async () => {
    h.connections = []
    expect(await listBackupDestinations()).toEqual({ success: true, data: [] })
  })
})
