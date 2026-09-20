/**
 * @vitest-environment node
 *
 * The promise reaching a board card.
 *
 * A card is built by one mapper from one select, so that the four queries
 * returning board jobs cannot drift apart (see the comment on
 * SERVICE_JOB_SELECT). A field the mapper hands out but the select never
 * reads is undefined at runtime while the types look right, so both are
 * checked here, together.
 */
import { describe, expect, it } from 'vitest'
import {
  inspectionToJob,
  SERVICE_JOB_SELECT,
  serviceRecordToJob,
} from '@/features/workboard/Actions/boardActions/mappers'

const PROMISED = new Date('2026-09-20T09:10:00.000Z')

const serviceRecord = {
  id: 'sr-1',
  title: 'Brakes',
  status: 'in-progress',
  startDateTime: new Date('2026-09-20T08:00:00.000Z'),
  endDateTime: new Date('2026-09-20T09:00:00.000Z'),
  promisedAt: PROMISED,
  technicianId: 'tech-1',
  workBayId: null,
  sortOrder: 0,
  vehicle: null,
  customer: { name: 'A customer' },
}

describe('a service record on the board', () => {
  it('carries the promise, as the card needs it', () => {
    expect(serviceRecordToJob(serviceRecord).promisedAt).toBe(PROMISED.toISOString())
  })

  it('carries none when none was made', () => {
    expect(serviceRecordToJob({ ...serviceRecord, promisedAt: null }).promisedAt).toBeNull()
  })

  it('is read from the database, not only typed', () => {
    expect(SERVICE_JOB_SELECT).toMatchObject({ promisedAt: true })
  })
})

describe('an inspection on the board', () => {
  it('has no promise at all: it is booked, never promised', () => {
    const job = inspectionToJob({
      id: 'insp-1',
      status: 'pending',
      startDateTime: null,
      endDateTime: null,
      technicianId: null,
      workBayId: null,
      sortOrder: 0,
      vehicle: {
        id: 'v-1',
        make: 'Volvo',
        model: 'V70',
        year: 2015,
        licensePlate: 'AB12345',
        customer: null,
      },
      template: { name: 'Annual check' },
    })

    expect(job.promisedAt).toBeNull()
  })
})
