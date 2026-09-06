/**
 * Taking the technician off a service record from the schedule card.
 *
 * The card's picker sends a null technician through scheduleJob. The
 * assignment and the printed copy of the name both have to go, while the bay
 * and the booked times stay as they were.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/features/workboard/Actions/boardActions/mappers', () => ({
  SERVICE_JOB_SELECT: {},
  INSPECTION_JOB_SELECT: {},
  serviceRecordToJob: (sr: unknown) => sr,
  inspectionToJob: (insp: unknown) => insp,
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    technician: { findFirst: vi.fn() },
    workBay: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), update: vi.fn() },
    inspection: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { scheduleJob } from '@/features/workboard/Actions/boardActions/scheduling'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ id: 'sr-a' } as any)
  vi.mocked(db.serviceRecord.update).mockResolvedValue({ id: 'sr-a' } as any)
})

describe('scheduleJob with a null technician', () => {
  it('clears the technician and the printed name, and nothing else', async () => {
    const result = await scheduleJob({ id: 'sr-a', type: 'serviceRecord', technicianId: null })

    expect(result.success).toBe(true)
    const { data } = vi.mocked(db.serviceRecord.update).mock.calls[0][0] as any
    expect(data).toEqual({ technicianId: null, techName: null })
    expect(vi.mocked(db.technician.findFirst)).not.toHaveBeenCalled()
  })

  it('still resolves a real technician by name when one is given', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({ name: 'Kim' } as any)

    await scheduleJob({ id: 'sr-a', type: 'serviceRecord', technicianId: 'tech-1' })

    const { data } = vi.mocked(db.serviceRecord.update).mock.calls[0][0] as any
    expect(data).toEqual({ technicianId: 'tech-1', techName: 'Kim' })
  })
})
