/**
 * The workshop's own work order statuses.
 *
 * The promise behind them is that nothing else in the app has to know they
 * exist: the record keeps one of the four statuses it always had, and a
 * status of the workshop's own is a label under it. These pin the rules that
 * keep that true: a label can only sit under its own stage, it goes when the
 * stage moves, and the four stored values are the only ones ever written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const serviceRecord = { findFirst: vi.fn(), update: vi.fn() }
const workOrderStatus = { findFirst: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { serviceRecord, workOrderStatus } }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org-1', userId: 'user-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))

import {
  SYSTEM_STATUSES,
  stageOf,
  statusColorClasses,
  statusColumns,
} from '@/features/work-order-statuses/Lib/stages'

const { updateServiceStatus } = await import('@/features/vehicles/Actions/serviceActions')

const READY = { id: 'st-ready', name: 'Ready for pickup', stage: 'completed' }

beforeEach(() => {
  vi.clearAllMocks()
  serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', title: 'Job', vehicleId: 'veh-1' })
  serviceRecord.update.mockResolvedValue({})
  workOrderStatus.findFirst.mockResolvedValue(READY)
})

describe('stages', () => {
  it('draws the built-in hold at the stage it belongs to', () => {
    expect(stageOf('waiting-parts')).toBe('in-progress')
    expect(stageOf('completed')).toBe('completed')
  })

  it('reads a status it does not know as not started, rather than as nothing', () => {
    // Online booking writes 'scheduled', which no stage is called.
    expect(stageOf('scheduled')).toBe('pending')
  })

  it('falls back to a neutral colour for one it does not have', () => {
    expect(statusColorClasses('chartreuse')).toBe(statusColorClasses('slate'))
    expect(statusColorClasses(null)).toBe(statusColorClasses('slate'))
  })

  it('drops the label whenever a job moves without one', () => {
    expect(statusColumns('in-progress')).toEqual({
      status: 'in-progress',
      customStatusId: null,
      customStatusSince: null,
    })
  })
})

describe('updateServiceStatus', () => {
  it('moves a job exactly as before when no status of the workshop is named', async () => {
    const result = await updateServiceStatus('rec-1', 'completed')

    expect(result.success).toBe(true)
    expect(workOrderStatus.findFirst).not.toHaveBeenCalled()
    expect(serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { status: 'completed', customStatusId: null, customStatusSince: null },
    })
  })

  it('accepts each of the four stored statuses and nothing else', async () => {
    for (const status of SYSTEM_STATUSES) {
      expect((await updateServiceStatus('rec-1', status)).success).toBe(true)
    }
    const stray = await updateServiceStatus('rec-1', 'ready-for-pickup')
    expect(stray.success).toBe(false)
    expect(serviceRecord.update).toHaveBeenCalledTimes(SYSTEM_STATUSES.length)
  })

  it('sets the stage and the workshop status together, with when', async () => {
    const result = await updateServiceStatus('rec-1', 'completed', 'st-ready')

    expect(result.success).toBe(true)
    const data = serviceRecord.update.mock.calls[0][0].data
    expect(data).toMatchObject({ status: 'completed', customStatusId: 'st-ready' })
    expect(data.customStatusSince).toBeInstanceOf(Date)
  })

  it('looks the status up in this workshop, among the ones still in use', async () => {
    await updateServiceStatus('rec-1', 'completed', 'st-ready')

    expect(workOrderStatus.findFirst.mock.calls[0][0].where).toEqual({
      id: 'st-ready',
      organizationId: 'org-1',
      archivedAt: null,
    })
  })

  it('refuses a status filed under another stage', async () => {
    const result = await updateServiceStatus('rec-1', 'in-progress', 'st-ready')

    expect(result.success).toBe(false)
    expect(serviceRecord.update).not.toHaveBeenCalled()
  })

  it('refuses one that does not exist, or belongs to somebody else', async () => {
    workOrderStatus.findFirst.mockResolvedValue(null)

    const result = await updateServiceStatus('rec-1', 'completed', 'st-other-workshop')

    expect(result.success).toBe(false)
    expect(serviceRecord.update).not.toHaveBeenCalled()
  })
})
