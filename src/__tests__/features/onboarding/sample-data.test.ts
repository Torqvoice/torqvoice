/**
 * Tests for the first-run sample data lifecycle.
 *
 * The seed records every id it creates in one AppSetting row; removal must
 * delete exactly those ids (scoped to the organization), in an order that
 * respects the FK graph, and then clear the row. The checklist must exclude
 * the sample ids from its counts, so the steps only complete on real data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    customer: { count: vi.fn(), deleteMany: vi.fn() },
    vehicle: { count: vi.fn(), deleteMany: vi.fn() },
    serviceRecord: { count: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    quote: { deleteMany: vi.fn() },
    inspection: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  getOnboardingChecklist,
  removeSampleData,
} from '@/features/onboarding/Actions/checklistActions'
import {
  parseSampleDataIds,
  hasAnySampleIds,
  EMPTY_SAMPLE_IDS,
} from '@/features/onboarding/Lib/onboardingKeys'

const ORG = 'org-1'
const USER_ID = 'user-1'

const SAMPLE_IDS = {
  customers: ['c1', 'c2', 'c3'],
  vehicles: ['v1', 'v2', 'v3', 'v4'],
  serviceRecords: ['s1', 's2', 's3'],
  quotes: ['q1'],
  inspections: ['i1'],
}

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: USER_ID, email: 'user@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({
    isSuperAdmin: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupAuth()
})

describe('parseSampleDataIds', () => {
  it('parses a recorded id set', () => {
    const ids = parseSampleDataIds(JSON.stringify(SAMPLE_IDS))
    expect(ids).toEqual(SAMPLE_IDS)
    expect(hasAnySampleIds(ids)).toBe(true)
  })

  it('survives missing, malformed and partial values', () => {
    expect(parseSampleDataIds(null)).toEqual(EMPTY_SAMPLE_IDS)
    expect(parseSampleDataIds('not json')).toEqual(EMPTY_SAMPLE_IDS)
    expect(parseSampleDataIds('{"customers": ["a", 5]}')).toEqual({
      ...EMPTY_SAMPLE_IDS,
      customers: ['a'],
    })
    expect(hasAnySampleIds(parseSampleDataIds(null))).toBe(false)
  })
})

describe('removeSampleData', () => {
  it('deletes exactly the recorded ids, org-scoped, and clears the marker', async () => {
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({
      id: 'setting-1',
      value: JSON.stringify(SAMPLE_IDS),
    } as never)
    vi.mocked(db.$transaction).mockResolvedValue([] as never)

    const result = await removeSampleData()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ removed: true })

    expect(db.serviceRecord.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.serviceRecords } },
    })
    expect(db.quote.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.quotes } },
    })
    expect(db.inspection.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.inspections } },
    })
    expect(db.vehicle.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.vehicles } },
    })
    expect(db.customer.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: SAMPLE_IDS.customers } },
    })
    expect(db.appSetting.delete).toHaveBeenCalledWith({
      where: { id: 'setting-1' },
    })
    // Everything runs inside one transaction.
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when nothing was recorded', async () => {
    vi.mocked(db.appSetting.findFirst).mockResolvedValue(null as never)

    const result = await removeSampleData()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ removed: false })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('getOnboardingChecklist', () => {
  const WORKSHOP = { name: 'Egeland Auto' }
  const LATEST = { id: 'wo-9', vehicleId: 'veh-2' }

  beforeEach(() => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(WORKSHOP as never)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null as never)
  })

  it('excludes sample ids from step detection', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'onboarding.checklistDismissed', value: 'false' },
      { key: 'onboarding.sampleDataIds', value: JSON.stringify(SAMPLE_IDS) },
    ] as never)
    // Only the sample rows exist, so every real count is zero.
    vi.mocked(db.serviceRecord.count).mockResolvedValue(0 as never)

    const result = await getOnboardingChecklist()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      steps: { workOrder: false, company: false, invoice: false },
      allDone: false,
      hasSampleData: true,
      workshopName: 'Egeland Auto',
      invoiceHref: '/work-orders',
    })

    expect(db.serviceRecord.count).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { notIn: SAMPLE_IDS.serviceRecords } },
    })
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { notIn: SAMPLE_IDS.serviceRecords } },
      })
    )
  })

  it('hides the card once dismissed', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'onboarding.checklistDismissed', value: 'true' },
    ] as never)

    const result = await getOnboardingChecklist()
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
    expect(db.serviceRecord.count).not.toHaveBeenCalled()
  })

  it('hides the card for pre-existing orgs that already do everything', async () => {
    // No onboarding rows at all: an org that predates the checklist, with an
    // address on file and work orders, some of them shared.
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'workshop.address', value: 'Verkstedveien 1' },
    ] as never)
    vi.mocked(db.serviceRecord.count).mockResolvedValue(80 as never)

    const result = await getOnboardingChecklist()
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('shows open steps for pre-existing orgs with partial data', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(LATEST as never)
    // First serviceRecord.count call: any work order; second: shared invoices.
    vi.mocked(db.serviceRecord.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never)

    const result = await getOnboardingChecklist()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      steps: { workOrder: true, company: false, invoice: false },
      allDone: false,
      hasSampleData: false,
      workshopName: 'Egeland Auto',
      invoiceHref: '/vehicles/veh-2/service/wo-9',
    })
  })

  it('treats a blank address as missing workshop details', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'workshop.address', value: '   ' },
    ] as never)
    vi.mocked(db.serviceRecord.count).mockResolvedValue(0 as never)

    const result = await getOnboardingChecklist()
    expect(result.data?.steps.company).toBe(false)
  })

  it('completes the invoice step from the download marker', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'onboarding.checklistDismissed', value: 'false' },
      { key: 'onboarding.invoiceIssued', value: 'true' },
      { key: 'workshop.address', value: 'Verkstedveien 1' },
    ] as never)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(LATEST as never)
    vi.mocked(db.serviceRecord.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never)

    const result = await getOnboardingChecklist()
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      steps: { workOrder: true, company: true, invoice: true },
      allDone: true,
      hasSampleData: false,
      workshopName: 'Egeland Auto',
      invoiceHref: '/vehicles/veh-2/service/wo-9',
    })
  })
})
