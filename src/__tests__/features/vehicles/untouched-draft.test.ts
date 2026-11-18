/**
 * The "New work order" page makes the job as it loads, and goes to the draft
 * it made a moment ago instead of making another when it is rendered twice.
 * That only works while the draft still counts as untouched, which a
 * workshop with a shop fee never saw: the fee is a labor line on every new
 * job.
 *
 * Prisma is not run here, so the filter is read the way the database would
 * read it, against drafts written out by hand.
 */
import { describe, expect, it } from 'vitest'
import { SHOP_FEE_PRICING } from '@/features/settings/Lib/shopFee'
import { untouchedDraftWhere } from '@/features/vehicles/Lib/untouchedDraft'

const NOW = new Date('2026-11-18T10:00:00Z')

type Draft = {
  vehicleId: string
  organizationId: string
  status: string
  createdAt: Date
  partItems: { name: string }[]
  laborItems: { pricingType: string }[]
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    status: 'pending',
    createdAt: new Date(NOW.getTime() - 1000),
    partItems: [],
    laborItems: [],
    ...overrides,
  }
}

/** Whether the page would go to this draft rather than make a new job. */
function reused(record: Draft): boolean {
  const where = untouchedDraftWhere({ vehicleId: 'veh-1', organizationId: 'org-1', now: NOW })
  const since = (where.createdAt as { gte: Date }).gte
  const labor = where.laborItems as { none: { pricingType: { not: string } } }
  const parts = where.partItems as { none: Record<string, never> }
  expect(parts.none).toEqual({})
  return (
    record.vehicleId === where.vehicleId &&
    record.organizationId === (where.vehicle as { organizationId: string }).organizationId &&
    record.status === where.status &&
    record.createdAt.getTime() >= since.getTime() &&
    record.partItems.length === 0 &&
    // none: no labor line that is anything other than the fee.
    !record.laborItems.some((line) => line.pricingType !== labor.none.pricingType.not)
  )
}

describe('the draft the New work order page just made', () => {
  it('is reused when nothing is on it', () => {
    expect(reused(draft())).toBe(true)
  })

  it('is reused when all it has is the shop fee the workshop adds to every job', () => {
    expect(reused(draft({ laborItems: [{ pricingType: SHOP_FEE_PRICING }] }))).toBe(true)
  })

  it('is left alone once somebody has added labor, beside the fee or not', () => {
    expect(reused(draft({ laborItems: [{ pricingType: 'hourly' }] }))).toBe(false)
    expect(
      reused(draft({ laborItems: [{ pricingType: SHOP_FEE_PRICING }, { pricingType: 'hourly' }] }))
    ).toBe(false)
  })

  it('is left alone once somebody has added a part', () => {
    expect(reused(draft({ partItems: [{ name: 'Oil filter' }] }))).toBe(false)
  })

  it('is left alone when it is older than a moment, another car, or another workshop', () => {
    expect(reused(draft({ createdAt: new Date(NOW.getTime() - 6000) }))).toBe(false)
    expect(reused(draft({ vehicleId: 'veh-2' }))).toBe(false)
    expect(reused(draft({ organizationId: 'org-2' }))).toBe(false)
    expect(reused(draft({ status: 'scheduled' }))).toBe(false)
  })
})
