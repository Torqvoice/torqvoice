import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * A service Torqvoice runs, such as the fault code service on the cloud, is
 * on for every workshop without anyone visiting the connect page, and off for
 * good once a workshop turns it off. Where the server holds no key, nothing
 * is connected for anyone: the workshop would have to bring a key.
 */

const h = vi.hoisted(() => ({
  connections: new Map<string, { id: string; status: string; createdById: string }>(),
  settings: new Map<string, string>(),
  features: { faultCodes: true, integrations: false } as Record<string, boolean>,
  manifests: [] as ConnectorManifest[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    integrationConnection: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { organizationId_connectorId: { organizationId: string; connectorId: string } }
        }) => {
          const k = where.organizationId_connectorId
          return h.connections.get(`${k.organizationId}:${k.connectorId}`) ?? null
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { organizationId: string; connectorId: string; status: string; createdById: string }
        }) => {
          const key = `${data.organizationId}:${data.connectorId}`
          if (h.connections.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' })
          const row = {
            id: `c${h.connections.size + 1}`,
            status: data.status,
            createdById: data.createdById,
          }
          h.connections.set(key, row)
          return row
        }
      ),
    },
    appSetting: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { organizationId_key: { organizationId: string; key: string } }
        }) => {
          const k = where.organizationId_key
          return h.settings.has(`${k.organizationId}:${k.key}`) ? { id: 's1' } : null
        }
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { organizationId_key: { organizationId: string; key: string } }
          create: { value: string }
        }) => {
          const k = where.organizationId_key
          const key = `${k.organizationId}:${k.key}`
          if (!h.settings.has(key)) h.settings.set(key, create.value)
          return {}
        }
      ),
    },
  },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => h.features) }))
vi.mock('@/integrations/registry', () => ({
  listManifests: () => h.manifests,
  getManifest: (id: string) => h.manifests.find((m) => m.id === id) ?? null,
}))
vi.mock('@/features/integrations/Lib/vault', () => ({
  sealCredentials: (v: unknown) => JSON.stringify(v),
}))

const { withServerKeys } =
  await vi.importActual<typeof import('@/integrations/registry')>('@/integrations/registry')
const { manifest: codes } = await import('@/integrations/torqvoice-codes/manifest')
const { db } = await import('@/lib/db')
const { autoConnect, autoConnectFor, markAutoConnectOptOut, readyToAutoConnect } = await import(
  '@/features/integrations/Lib/auto-connect'
)

/** The codes manifest as the registry hands it out, with or without our key on the server. */
function install(serverKey: string | null) {
  h.manifests = [withServerKeys(codes, serverKey ? { TORQVOICE_CODES_API_TOKEN: serverKey } : {})]
}

const row = (org = 'org1') => h.connections.get(`${org}:torqvoice-codes`)

beforeEach(() => {
  h.connections.clear()
  h.settings.clear()
  h.features = { faultCodes: true, integrations: false }
  vi.mocked(db.integrationConnection.create).mockClear()
})

describe('a service that is on for every workshop', () => {
  it('is connected on the first ask, with our key and nothing typed', async () => {
    install('tvc_live_ourkey')
    expect(readyToAutoConnect(h.manifests[0])).toBe(true)
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(true)
    expect(row()).toMatchObject({ status: 'active', createdById: 'system' })
    // Asked again, the connection it has is left alone.
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(false)
    expect(db.integrationConnection.create).toHaveBeenCalledTimes(1)
  })

  it('is found by the capability a screen asks for', async () => {
    install('tvc_live_ourkey')
    expect(await autoConnectFor('org1', 'diagnostics.codes')).toBe(true)
    expect(await autoConnectFor('org2', 'calendar.push')).toBe(false)
    expect(row('org2')).toBeUndefined()
  })

  it('connects nobody where the server holds no key', async () => {
    install(null)
    expect(readyToAutoConnect(h.manifests[0])).toBe(false)
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(false)
    expect(row()).toBeUndefined()
  })

  it('stays off once the workshop disconnects it', async () => {
    install('tvc_live_ourkey')
    await autoConnect('org1', 'torqvoice-codes')
    // What disconnectIntegration does: the marker, then the row goes.
    await markAutoConnectOptOut('org1', 'torqvoice-codes', 'user1')
    h.connections.delete('org1:torqvoice-codes')

    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(false)
    expect(row()).toBeUndefined()
    // Another workshop is not affected.
    expect(await autoConnect('org2', 'torqvoice-codes')).toBe(true)
  })

  it('never writes over a connection the workshop has, whatever its state', async () => {
    install('tvc_live_ourkey')
    h.connections.set('org1:torqvoice-codes', { id: 'own', status: 'error', createdById: 'user1' })
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(false)
    expect(row()).toMatchObject({ id: 'own', status: 'error' })
  })

  it('waits for a plan that includes it', async () => {
    install('tvc_live_ourkey')
    h.features = { faultCodes: false, integrations: true }
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(false)
    expect(row()).toBeUndefined()
    h.features = { faultCodes: true, integrations: false }
    expect(await autoConnect('org1', 'torqvoice-codes')).toBe(true)
  })

  it('makes one connection when two pages ask at once', async () => {
    install('tvc_live_ourkey')
    const both = await Promise.all([
      autoConnect('org1', 'torqvoice-codes'),
      autoConnect('org1', 'torqvoice-codes'),
    ])
    expect(both).toEqual([true, true])
    expect(h.connections.size).toBe(1)
  })

  it('leaves no marker when an ordinary connector is disconnected', async () => {
    h.manifests = [{ ...codes, id: 'other', autoConnect: undefined }]
    await markAutoConnectOptOut('org1', 'other', 'user1')
    expect(h.settings.size).toBe(0)
  })
})
