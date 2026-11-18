// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which repository the restore point explorer may read from: the platform
 * one while the plan has it (or during the grace period after a downgrade),
 * or a backup destination the workshop connected and its plan allows.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  config: { bucket: 'b' } as Row | null,
  features: { platformBackups: true, integrations: true } as Record<string, boolean>,
  platformRow: null as Row | null,
  connections: [] as Row[],
  manifests: {} as Record<string, Row | undefined>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    platformBackup: {
      findUnique: vi.fn(async () => h.platformRow),
    },
    integrationConnection: {
      findUnique: vi.fn(
        async ({ where }: { where: { organizationId_connectorId: Row } }) =>
          h.connections.find(
            (c) =>
              c.organizationId === where.organizationId_connectorId.organizationId &&
              c.connectorId === where.organizationId_connectorId.connectorId
          ) ?? null
      ),
    },
  },
}))

vi.mock('@/integrations/registry', () => ({
  getManifest: (id: string) => h.manifests[id],
  listManifests: () => Object.values(h.manifests).filter(Boolean),
}))

vi.mock('@/lib/features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/features')>()
  return {
    ...actual,
    getFeatures: vi.fn(async () => h.features),
    isCloudMode: () => true,
  }
})

vi.mock('@/lib/backup/platform', () => ({
  platformBackupConfig: () => h.config,
  platformBackupAllowed: (features: { platformBackups: boolean }) => features.platformBackups,
}))

import { resolveExploreTarget } from '@/features/integrations/Lib/explore-source'
import { db } from '@/lib/db'
import { FeatureGatedError, getFeatures } from '@/lib/features'

const ORG = 'org1'

beforeEach(() => {
  h.config = { bucket: 'b' }
  h.features = { platformBackups: true, integrations: true, ai: false }
  h.platformRow = null
  h.connections = []
  h.manifests = {
    s3: { id: 's3', name: 'Cloud storage bucket', capabilities: ['backup.target'] },
    'local-folder': {
      id: 'local-folder',
      name: 'Local folder',
      capabilities: ['backup.target'],
      plan: 'platformBackups',
    },
    fiken: { id: 'fiken', name: 'Fiken', capabilities: ['accounting'] },
  }
  vi.mocked(db.platformBackup.findUnique).mockClear()
})

describe('resolveExploreTarget: platform', () => {
  it('is the workshop’s own platform repository when the plan has it', async () => {
    await expect(resolveExploreTarget(ORG, { kind: 'platform' })).resolves.toEqual({
      kind: 'platform',
      organizationId: ORG,
    })
    expect(getFeatures).toHaveBeenCalledWith(ORG)
    expect(db.platformBackup.findUnique).not.toHaveBeenCalled()
  })

  it('refuses when platform backups are not set up here', async () => {
    h.config = null
    await expect(resolveExploreTarget(ORG, { kind: 'platform' })).rejects.toThrow(
      'Backups by Torqvoice are not available here'
    )
  })

  it('refuses when the plan does not have it and nothing is paused', async () => {
    h.features.platformBackups = false
    const err = await resolveExploreTarget(ORG, { kind: 'platform' }).catch((e) => e)
    expect(err).toBeInstanceOf(FeatureGatedError)
    expect(err.feature).toBe('platformBackups')
    expect(db.platformBackup.findUnique).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      select: { pausedAt: true, purgedAt: true },
    })
  })

  it('refuses when the plan does not have it and the row was never paused', async () => {
    h.features.platformBackups = false
    h.platformRow = { pausedAt: null, purgedAt: null }
    await expect(resolveExploreTarget(ORG, { kind: 'platform' })).rejects.toBeInstanceOf(
      FeatureGatedError
    )
  })

  it('allows looking during the grace period after a downgrade', async () => {
    h.features.platformBackups = false
    h.platformRow = { pausedAt: new Date('2026-10-20T00:00:00Z'), purgedAt: null }
    await expect(resolveExploreTarget(ORG, { kind: 'platform' })).resolves.toEqual({
      kind: 'platform',
      organizationId: ORG,
    })
  })

  it('refuses once the repository was purged', async () => {
    h.features.platformBackups = false
    h.platformRow = {
      pausedAt: new Date('2026-09-01T00:00:00Z'),
      purgedAt: new Date('2026-10-01T00:00:00Z'),
    }
    await expect(resolveExploreTarget(ORG, { kind: 'platform' })).rejects.toBeInstanceOf(
      FeatureGatedError
    )
  })
})

describe('resolveExploreTarget: destination', () => {
  function connect(connectorId: string, status: string, organizationId = ORG) {
    h.connections.push({
      id: `conn-${connectorId}-${organizationId}`,
      organizationId,
      connectorId,
      status,
    })
  }

  it('refuses a connector that is not a backup destination, or that does not exist', async () => {
    connect('fiken', 'active')
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 'fiken' })
    ).rejects.toThrow('This integration is not a backup destination')
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 'nope' })
    ).rejects.toThrow('This integration is not a backup destination')
  })

  it('refuses a destination the plan does not allow', async () => {
    connect('s3', 'active')
    h.features.integrations = false
    const err = await resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(FeatureGatedError)
    expect(err.feature).toBe('integrations')

    // A connector gated by its own plan feature names that feature.
    connect('local-folder', 'active')
    h.features.integrations = true
    h.features.platformBackups = false
    const own = await resolveExploreTarget(ORG, {
      kind: 'destination',
      connectorId: 'local-folder',
    }).catch((e) => e)
    expect(own).toBeInstanceOf(FeatureGatedError)
    expect(own.feature).toBe('platformBackups')
  })

  it('refuses a destination that is not connected, or not active', async () => {
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
    ).rejects.toThrow('Connect the destination first')

    // Another workshop's connection is not this one's.
    connect('s3', 'active', 'org2')
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
    ).rejects.toThrow('Connect the destination first')

    for (const status of ['disconnected', 'pending', 'disabled']) {
      h.connections = [{ id: 'c', organizationId: ORG, connectorId: 's3', status }]
      await expect(
        resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
      ).rejects.toThrow('Connect the destination first')
    }
  })

  it('is the workshop’s own connection when it is active or in error', async () => {
    connect('s3', 'active')
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
    ).resolves.toEqual({ kind: 'destination', connectionId: 'conn-s3-org1' })

    h.connections = [{ id: 'conn-err', organizationId: ORG, connectorId: 's3', status: 'error' }]
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
    ).resolves.toEqual({ kind: 'destination', connectionId: 'conn-err' })
  })

  it('does not need the platform repository', async () => {
    h.config = null
    h.features.platformBackups = false
    connect('s3', 'active')
    await expect(
      resolveExploreTarget(ORG, { kind: 'destination', connectorId: 's3' })
    ).resolves.toEqual({ kind: 'destination', connectionId: 'conn-s3-org1' })
  })
})
