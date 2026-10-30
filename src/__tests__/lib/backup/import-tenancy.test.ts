/**
 * @vitest-environment node
 *
 * The upload route with a crafted file: ids that are another workshop's
 * rows refuse the whole file before anything is written, foreign keys that
 * point outside the file never reach a write, a second restore is told the
 * server is busy, and on the cloud an administrator is sent to the owner.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  /** Rows of other workshops, by model: what the tenancy check finds. */
  foreign: {} as Record<string, string[]>,
  /** Rows this workshop already has, by model. */
  own: {} as Record<string, string[]>,
  calls: [] as { model: string; method: string; args: any }[],
  cloud: false,
  role: 'admin',
}))

vi.mock('@/lib/db', () => {
  const tx = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_t, method: string) => async (args: any) => {
              state.calls.push({ model, method, args })
              if (method === 'findMany' && args?.where?.id?.in) {
                const ids: string[] = args.where.id.in
                const table = 'NOT' in args.where ? state.foreign : state.own
                return (table[model] ?? []).filter((id) => ids.includes(id)).map((id) => ({ id }))
              }
              if (method === 'findMany') return []
              if (method === 'findFirst' || method === 'findUnique') return null
              return { count: 0 }
            },
          }
        ),
    }
  )
  return { db: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } }
})
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(async () => ({
    organizationId: 'org-a',
    userId: 'user-1',
    isAdmin: true,
    role: state.role,
  })),
}))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  isCloudMode: () => state.cloud,
}))
vi.mock('@/lib/files/manager', () => ({ releaseFilesNotRestored: vi.fn(async () => undefined) }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads-test' }))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/protected/backup/import/route'
import { acquireRestoreLock, releaseRestoreLock } from '@/lib/backup/tenancy'

function importJson(data: Record<string, unknown>) {
  return POST(
    new NextRequest('http://app.test/api/protected/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data }),
    })
  )
}

const WRITES = new Set(['create', 'createMany', 'deleteMany', 'updateMany', 'update', 'upsert'])
const writes = () => state.calls.filter((c) => WRITES.has(c.method))

/** A workshop's file with a customer, a vehicle with a job, a quote and an inspection. */
function file() {
  return {
    customers: [{ id: 'cust-a', name: 'Kari', userId: 'u' }],
    technicians: [{ id: 'tech-a', name: 'Ola' }],
    inspectionTemplates: [{ id: 'tmpl-a', name: 'Default', sections: [] }],
    vehicles: [
      {
        id: 'veh-a',
        make: 'Volvo',
        model: 'V70',
        year: 2015,
        customerId: 'cust-a',
        serviceRecords: [
          {
            id: 'job-a',
            title: 'Brakes',
            technicianId: 'tech-a',
            workBayId: 'bay-of-org-b',
            partItems: [{ id: 'part-a', name: 'Pads', inventoryPartId: 'inv-of-org-b' }],
          },
        ],
      },
    ],
    quotes: [{ id: 'quote-a', title: 'Tyres', vehicleId: 'veh-a', inspectionId: 'insp-of-org-b' }],
    inspections: [{ id: 'insp-a', vehicleId: 'veh-a', templateId: 'tmpl-of-org-b', items: [] }],
  }
}

beforeEach(() => {
  state.foreign = {}
  state.own = {}
  state.calls = []
  state.cloud = false
  state.role = 'admin'
})

describe("a file that reuses another workshop's ids", () => {
  it('is refused before anything is written, with a reason', async () => {
    state.foreign = { vehicle: ['veh-a'] }
    const response = await importJson(file())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'The file holds 1 Vehicle id(s) that belong to another workshop',
      code: 'foreign_ids',
    })
    expect(writes()).toEqual([])
  })

  it('is refused for a child row too', async () => {
    state.foreign = { servicePart: ['part-a'] }
    const response = await importJson(file())
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('foreign_ids')
    expect(writes()).toEqual([])
    // Asked through the part's job, since a part has no organisation column.
    const asked = state.calls.find(
      (c) => c.model === 'servicePart' && c.method === 'findMany' && 'NOT' in c.args.where
    )
    expect(asked?.args.where.NOT).toEqual({ serviceRecord: { organizationId: 'org-a' } })
  })
})

describe('a file whose foreign keys point at another workshop', () => {
  it('never writes one of those ids', async () => {
    const response = await importJson(file())
    expect(response.status).toBe(200)
    const written = JSON.stringify(writes())
    expect(written).not.toContain('org-b')
    // The job and the quote came through without the links; the inspection,
    // whose template is required, did not come through at all.
    expect(written).toContain('job-a')
    expect(written).toContain('quote-a')
    expect(written).not.toContain('insp-a')
    expect(
      state.calls.some(
        (c) => c.model === 'inspection' && WRITES.has(c.method) && c.method !== 'deleteMany'
      )
    ).toBe(false)
  })

  it('keeps a link to a row this workshop already has', async () => {
    state.own = { inventoryPart: ['inv-of-org-b'] }
    await importJson(file())
    const parts = state.calls.find((c) => c.model === 'servicePart' && c.method === 'createMany')
    expect(parts?.args.data[0].inventoryPartId).toBe('inv-of-org-b')
  })
})

describe('one restore at a time', () => {
  it('tells a second restore the server is busy', async () => {
    expect(acquireRestoreLock('another-restore')).toBe(true)
    try {
      const response = await importJson(file())
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe('busy')
      expect(state.calls).toEqual([])
    } finally {
      releaseRestoreLock('another-restore')
    }
  })
})

describe('on the cloud', () => {
  it('sends an administrator to the owner, and lets the owner through', async () => {
    state.cloud = true
    const refused = await importJson(file())
    expect(refused.status).toBe(403)
    expect((await refused.json()).code).toBe('owner_only')
    expect(state.calls).toEqual([])

    state.role = 'owner'
    const allowed = await importJson(file())
    expect(allowed.status).toBe(200)
  })
})
