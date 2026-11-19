/**
 * @vitest-environment node
 *
 * The signed-in layout says whether the workshop has fields of its own on
 * vehicles and customers, so the forms draw them. That costs nothing for a
 * workshop whose plan has no custom fields: it is not even asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false, emailVerified: true })) },
  appSetting: { findMany: vi.fn(async () => []) },
  organizationMember: {
    findMany: vi.fn(async () => [
      { role: 'owner', organization: { id: 'org-1', name: 'ZZ', createdAt: new Date() } },
    ]),
  },
  customFieldDefinition: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
  getCachedMembership: vi.fn(async () => ({ organizationId: 'org-1', role: 'owner' })),
}))
vi.mock('@/lib/session-scope', () => ({ sessionOrganizationScope: () => null }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))

import { getFeatures } from '@/lib/features'
import { getLayoutData } from '@/lib/get-layout-data'

beforeEach(() => vi.clearAllMocks())

describe('the layout and the workshop’s own fields', () => {
  it('asks nothing about them on a plan without custom fields', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: false } as never)

    const data = await getLayoutData()

    expect(db.customFieldDefinition.findMany).not.toHaveBeenCalled()
    expect(data).toMatchObject({ recordCustomFields: { vehicle: false, customer: false } })
  })

  it('reads at most one row per kind on a plan with them', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: true } as never)
    db.customFieldDefinition.findMany.mockResolvedValue([{ entityType: 'vehicle' }])

    const data = await getLayoutData()

    expect(db.customFieldDefinition.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isActive: true,
        entityType: { in: ['vehicle', 'customer'] },
      },
      select: { entityType: true },
      distinct: ['entityType'],
    })
    expect(data).toMatchObject({ recordCustomFields: { vehicle: true, customer: false } })
  })

  it('reads the plan once, whatever else the layout asks it', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: true } as never)
    db.customFieldDefinition.findMany.mockResolvedValue([])
    db.appSetting.findMany.mockResolvedValue([
      { key: 'vehicle.fleetNumberEnabled', value: 'true' },
      { key: 'documents.customerReferenceEnabled', value: 'true' },
    ] as never)

    await getLayoutData()

    expect(getFeatures).toHaveBeenCalledTimes(1)
  })
})
