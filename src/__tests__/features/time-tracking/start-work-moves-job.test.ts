/**
 * @vitest-environment node
 *
 * Starting the clock on a job that has not been started moves it to In
 * Progress. The app's button says "Start work", and a running clock under a
 * stage that still read "Not started" told the desk the opposite of what was
 * happening in the bay.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { status: 'pending' as string }

vi.mock('@/lib/db', () => {
  const tx = {
    timeEntry: {
      update: vi.fn(),
      create: vi.fn(async () => ({
        id: 'entry-1',
        startedAt: new Date(),
        technicianId: 'tech-1',
        serviceRecordId: 'job-1',
        serviceRecord: { id: 'job-1', title: 'Brake pads', status: state.status },
      })),
    },
    serviceRecord: {
      update: vi.fn(async ({ data }: { data: { status: string } }) => {
        state.status = data.status
        return { id: 'job-1', status: data.status }
      }),
    },
  }
  return {
    db: {
      serviceRecord: {
        findFirst: vi.fn(async () => ({
          id: 'job-1',
          status: state.status,
          title: 'Brake pads',
          vehicle: {
            id: 'veh-1',
            make: 'Honda',
            model: 'Civic',
            year: 2020,
            licensePlate: 'NC-6677',
          },
        })),
      },
      timeEntry: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => run(tx)),
      __tx: tx,
    },
  }
})

import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { startEntry } from '@/features/time-tracking/Lib/timeEntries'

const tx = (db as unknown as { __tx: { serviceRecord: { update: ReturnType<typeof vi.fn> } } }).__tx

let heard: { type: string; status?: string }[]
beforeEach(() => {
  vi.clearAllMocks()
  heard = []
  notificationBus.removeAllListeners('workboard')
  notificationBus.on('workboard', (event: { type: string; status?: string }) => heard.push(event))
})

const start = () =>
  startEntry({
    organizationId: 'org-1',
    technicianId: 'tech-1',
    technicianIds: ['tech-1'],
    serviceRecordId: 'job-1',
  })

describe('starting work on a job', () => {
  it.each([
    'pending',
    'scheduled',
  ])('moves a %s job to In Progress and tells the desk', async (from) => {
    state.status = from
    const { entry } = await start()

    expect(tx.serviceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        // A status of the workshop's own belonged to the stage it left.
        data: { status: 'in-progress', customStatusId: null, customStatusSince: null },
      })
    )
    expect(entry.serviceRecord.status).toBe('in-progress')
    expect(heard).toContainEqual(
      expect.objectContaining({ type: 'job_status_changed', status: 'in-progress' })
    )
  })

  it.each([
    'in-progress',
    'waiting-parts',
    'completed',
  ])('leaves a job that is already %s where it is', async (from) => {
    state.status = from
    await start()

    expect(tx.serviceRecord.update).not.toHaveBeenCalled()
    expect(heard.map((e) => e.type)).toEqual(['clock_started'])
  })
})
