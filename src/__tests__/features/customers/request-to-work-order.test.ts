/**
 * Turning a customer's portal request into a work order. The job should open
 * with the customer's own words as its first concern, booked on the day they
 * asked for: it used to open with an empty job description, booked at midnight.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/features/vehicles/Actions/createDraftServiceRecord', () => ({
  createDraftServiceRecord: vi.fn(async () => ({ success: true, data: { id: 'job-1' } })),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    serviceRequest: { findFirst: vi.fn(), update: vi.fn() },
    serviceRecord: { update: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { createDraftServiceRecord } from '@/features/vehicles/Actions/createDraftServiceRecord'
import { createWorkOrderFromRequest } from '@/features/customers/Actions/customerActions'

const WORDS = 'Squealing from the rear brakes when I stop, mostly in the mornings.'
const ASKED = new Date('2026-11-16T06:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'u1', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false, name: 'Alex' } as never)
  vi.mocked(db.serviceRequest.findFirst).mockResolvedValue({
    id: 'req-1',
    status: 'pending',
    description: WORDS,
    preferredDate: ASKED,
    vehicleId: 'veh-1',
    adminNotes: null,
    vehicle: { id: 'veh-1' },
  } as never)
})

describe('a portal request turned into a work order', () => {
  it("opens with the customer's words as the first concern", async () => {
    const result = await createWorkOrderFromRequest('req-1')
    expect(result.success).toBe(true)
    const update = vi.mocked(db.serviceRecord.update).mock.calls[0][0] as {
      data: { concerns?: { create: { description: string } } }
    }
    expect(update.data.concerns?.create.description).toBe(WORDS)
  })

  it('is booked from the day the customer asked for, not with that day as its start time', async () => {
    await createWorkOrderFromRequest('req-1')
    const args = vi.mocked(createDraftServiceRecord).mock.calls[0] as unknown[]
    expect(args[1]).toBeUndefined()
    expect(args[5]).toEqual(ASKED)
  })
})
