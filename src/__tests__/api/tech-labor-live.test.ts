/**
 * @vitest-environment node
 *
 * Telling the desk that a technician billed time.
 *
 * The app posts the line, the job's totals are recalculated, and a desk with
 * that work order open has to learn about it without reloading. That last
 * step is one event on the work board channel, the same channel the clock
 * uses, carrying ids only: whoever listens reads the job back themselves.
 *
 * A line written with nobody told is the case this guards. It looks correct
 * everywhere except on the screen of the person writing the invoice, who
 * saves the list they loaded and deletes the technician's work with it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  labor: { id: 'lab-1', description: 'Timing belt', hours: 1.5, rate: 900, total: 1350 },
  job: {
    id: 'rec-1',
    title: 'Service',
    taxRate: 25,
    taxInclusive: false,
    taxComponents: null,
    discountType: null,
    discountValue: 0,
  } as Record<string, unknown> | null,
  transactionThrows: false,
}

vi.mock('@/lib/db', () => {
  const tx = {
    serviceLabor: {
      create: vi.fn(async () => state.labor),
      aggregate: vi.fn(async () => ({ _sum: { total: 1350 } })),
    },
    servicePart: { aggregate: vi.fn(async () => ({ _sum: { total: 0 } })) },
    serviceRecord: { update: vi.fn(async () => ({})) },
  }
  return {
    db: {
      serviceRecord: { findFirst: vi.fn(async () => state.job) },
      appSetting: { findFirst: vi.fn(async () => ({ value: '900' })) },
      $transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => {
        if (state.transactionThrows) throw new Error('rolled back')
        return run(tx)
      }),
    },
  }
})

vi.mock('@/lib/document-lock.server', () => ({ assertInvoiceEditable: vi.fn(async () => {}) }))

vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(
      async (
        _request: Request,
        handler: (ctx: {
          organizationId: string
          technicianIds: string[]
          isAdmin: boolean
        }) => Promise<Response>
      ) => handler({ organizationId: 'org-1', technicianIds: ['tech-1'], isAdmin: false })
    ),
  }
})

import { notificationBus } from '@/lib/notification-bus'
import { POST } from '@/app/api/v1/tech/jobs/[id]/labor/route'

function post(body: unknown) {
  return POST(
    new Request('https://app.test/api/v1/tech/jobs/rec-1/labor', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'rec-1' }) }
  )
}

let heard: unknown[]
beforeEach(() => {
  state.job = {
    id: 'rec-1',
    title: 'Service',
    taxRate: 25,
    taxInclusive: false,
    taxComponents: null,
    discountType: null,
    discountValue: 0,
  }
  state.transactionThrows = false
  heard = []
  notificationBus.removeAllListeners('workboard')
  notificationBus.on('workboard', (event: unknown) => heard.push(event))
})

describe('a technician adding a line of work', () => {
  it('tells the workshop which job gained it, and nothing more', async () => {
    const response = await post({ description: 'Timing belt', hours: 1.5 })

    expect(response.status).toBe(201)
    expect(heard).toEqual([
      {
        type: 'job_labor_added',
        organizationId: 'org-1',
        serviceRecordId: 'rec-1',
        laborId: 'lab-1',
      },
    ])
  })

  it('says nothing when the job is not this technician’s', async () => {
    state.job = null

    const response = await post({ hours: 1 })

    expect(response.status).toBe(404)
    expect(heard).toEqual([])
  })

  it('says nothing when the write rolled back', async () => {
    state.transactionThrows = true

    await expect(post({ hours: 1 })).rejects.toThrow('rolled back')
    expect(heard).toEqual([])
  })
})
