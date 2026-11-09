/**
 * @vitest-environment node
 *
 * Checking a car in from the technician app.
 *
 * The app reads the job's check-in (the map, the marks, the drop-off photos),
 * draws marks, and confirms or clears what earlier visits found. Each of
 * those is a record the desk and the print rely on, so the rules have to be
 * the web's: a mark is drawn on this job's drop-off, numbered as the web
 * numbers it, an earlier visit's mark is never edited from here, and nobody
 * reaches a job that is not theirs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Mark = {
  id: string
  organizationId: string
  vehicleId: string
  inspectionId: string | null
  inspectionItemId: string | null
  serviceRecordId: string | null
  bodyType: string
  view: string
  panel: string
  x: number
  y: number
  kind: string
  severity: string
  note: string | null
  imageUrls: string[]
  recordedAt: Date
  resolvedAt: Date | null
  carriedToId: string | null
}

const JOB = {
  id: 'job-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  technicianId: 'tech-1',
  status: 'scheduled',
  mileage: null as number | null,
  inspectionId: null,
  invoiceNumber: 'WO-1',
  createdAt: new Date('2026-11-09T08:00:00Z'),
}
const OLD_JOB = { ...JOB, id: 'job-0', createdAt: new Date('2026-05-01T08:00:00Z') }

const state = {
  marks: [] as Mark[],
  vehicle: {
    id: 'veh-1',
    organizationId: 'org-1',
    make: 'Toyota',
    model: 'Hilux',
    year: 2018,
    licensePlate: 'AB12345',
    mileage: 120000,
    bodyType: null as string | null,
  },
  attachments: [] as {
    id: string
    description: string
    fileUrl: string
    createdAt: Date
    category: string
  }[],
  ctx: { userId: 'user-1', organizationId: 'org-1', technicianIds: ['tech-1'], isAdmin: false },
}

function mark(over: Partial<Mark>): Mark {
  return {
    id: 'm',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    inspectionId: null,
    inspectionItemId: null,
    serviceRecordId: JOB.id,
    bodyType: 'pickup',
    view: 'left',
    panel: 'left_front_door',
    x: 0.5,
    y: 0.5,
    kind: 'dent',
    severity: 'minor',
    note: null,
    imageUrls: [],
    recordedAt: new Date('2026-11-09T09:00:00Z'),
    resolvedAt: null,
    carriedToId: null,
    ...over,
  }
}

const jobs = [JOB, OLD_JOB]
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as object))
      return (v as { in: unknown[] }).in.includes(row[k])
    if (v && typeof v === 'object' && 'not' in (v as object))
      return row[k] !== (v as { not: unknown }).not
    if (v && typeof v === 'object' && 'lt' in (v as object))
      return (row[k] as number) < (v as { lt: number }).lt
    return row[k] === v
  })

vi.mock('@/lib/db', () => {
  const db = {
    serviceRecord: {
      findFirst: vi.fn(
        async ({
          where,
          select,
        }: {
          where: Record<string, unknown>
          select: Record<string, unknown>
        }) => {
          const job = jobs.find((j) => matches(j as Record<string, unknown>, where))
          if (!job) return null
          if (select.vehicle) {
            return {
              ...job,
              vehicle: state.vehicle,
              attachments: state.attachments.filter((a) => a.category === 'dropoff'),
            }
          }
          return job
        }
      ),
      update: vi.fn(async ({ data }: { data: { mileage: number | null } }) => {
        JOB.mileage = data.mileage
        return JOB
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>
          data: Record<string, unknown>
        }) => {
          const job = jobs.find((j) => matches(j as Record<string, unknown>, where))
          if (!job) return { count: 0 }
          Object.assign(job, data)
          return { count: 1 }
        }
      ),
    },
    vehicle: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>
          data: Record<string, unknown>
        }) => {
          if (!matches(state.vehicle as Record<string, unknown>, where)) return { count: 0 }
          Object.assign(state.vehicle, data)
          return { count: 1 }
        }
      ),
    },
    inspection: { findFirst: vi.fn(async () => null) },
    appSetting: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    conditionMarkType: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    conditionMark: {
      findMany: vi.fn(async () =>
        state.marks.map((m) => ({
          ...m,
          // When each visit was opened: this job, an earlier one, a later one.
          serviceRecord: {
            createdAt:
              m.serviceRecordId === JOB.id
                ? JOB.createdAt
                : m.serviceRecordId === 'job-later'
                  ? new Date('2026-11-20T08:00:00Z')
                  : OLD_JOB.createdAt,
          },
          inspection: null,
        }))
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          state.marks.find((m) => matches(m as Record<string, unknown>, where)) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Partial<Mark> }) => {
        const created = mark({
          ...data,
          id: `m${state.marks.length + 1}`,
          recordedAt: data.recordedAt ?? new Date(),
        })
        state.marks.push(created)
        return created
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Omit<Partial<Mark>, 'imageUrls'> & { imageUrls?: string[] | { push: string } }
        }) => {
          const m = state.marks.find((x) => x.id === where.id) as Mark
          const { imageUrls, ...rest } = data
          Object.assign(m, rest)
          if (imageUrls) {
            m.imageUrls = Array.isArray(imageUrls) ? imageUrls : [...m.imageUrls, imageUrls.push]
          }
          return m
        }
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<Mark> }) => {
          const found = state.marks.filter((m) => matches(m as Record<string, unknown>, where))
          for (const m of found) Object.assign(m, data)
          return { count: found.length }
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.marks = state.marks.filter((m) => m.id !== where.id)
      }),
    },
    serviceAttachment: {
      count: vi.fn(async () => state.attachments.length),
      create: vi.fn(
        async ({ data }: { data: { description: string; fileUrl: string; category: string } }) => {
          const row = { id: `a${state.attachments.length + 1}`, createdAt: new Date(), ...data }
          state.attachments.push(row)
          return row
        }
      ),
    },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
    $queryRaw: vi.fn(async () => []),
  }
  return { db }
})

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/realtime/publish.server', () => ({ publishRecordChange: vi.fn() }))
vi.mock('@/features/vehicles/Lib/jobEvents', () => ({ announceJobStatusChanged: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => undefined),
  discardUnsavedUpload: vi.fn(async () => undefined),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'Europe/Oslo') }))
vi.mock('@/i18n/locale-from-request', () => ({
  getBestLocaleFromHeader: (h: string | null) =>
    h?.startsWith('nb') ? 'nb' : h ? 'en' : undefined,
  resolveDocumentLocale: vi.fn(async () => 'en'),
}))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(async (_req: Request, handler: (ctx: unknown) => Promise<Response>) =>
      handler(state.ctx)
    ),
  }
})

import { GET, PATCH } from '@/app/api/v1/tech/jobs/[id]/checkin/route'
import { POST as addMark } from '@/app/api/v1/tech/jobs/[id]/checkin/marks/route'
import {
  DELETE as removeMark,
  PATCH as changeMark,
} from '@/app/api/v1/tech/jobs/[id]/checkin/marks/[markId]/route'
import { POST as resolve } from '@/app/api/v1/tech/jobs/[id]/checkin/marks/[markId]/resolve/route'
import { POST as carry } from '@/app/api/v1/tech/jobs/[id]/checkin/marks/carry/route'
import { POST as addPhoto } from '@/app/api/v1/tech/jobs/[id]/checkin/photos/route'
import { POST as addMarkPhoto } from '@/app/api/v1/tech/jobs/[id]/checkin/marks/[markId]/photos/route'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { db } from '@/lib/db'

const req = (body?: unknown, init: RequestInit & { lang?: string } = {}) =>
  new Request('http://app.test/api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.lang ? { 'accept-language': init.lang } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const job = (id = JOB.id) => ({ params: Promise.resolve({ id }) })
const onMark = (markId: string) => ({ params: Promise.resolve({ id: JOB.id, markId }) })
const read = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => {
  state.marks = []
  state.attachments = []
  state.vehicle.mileage = 120000
  state.vehicle.bodyType = null
  state.ctx = {
    userId: 'user-1',
    organizationId: 'org-1',
    technicianIds: ['tech-1'],
    isAdmin: false,
  }
  JOB.mileage = null
  JOB.status = 'scheduled'
})

describe('reading a check-in', () => {
  it('draws the vehicle, numbers earlier marks before this visit’s, and names panels in the app’s language', async () => {
    state.marks = [
      mark({ id: 'now', recordedAt: new Date('2026-11-09T09:00:00Z') }),
      mark({
        id: 'before',
        serviceRecordId: OLD_JOB.id,
        panel: 'hood',
        view: 'top',
        recordedAt: new Date('2026-05-01T09:00:00Z'),
      }),
    ]
    const { status, body } = await read(
      await GET(new Request('http://app.test/api', { headers: { 'accept-language': 'nb' } }), job())
    )
    expect(status).toBe(200)
    const data = body.data
    expect(data.sheet.body).toBe('sedan')
    expect(data.sheet.panels.length).toBeGreaterThan(20)
    expect(data.sheet.views.map((v: { view: string }) => v.view)).toEqual(
      expect.arrayContaining(['top', 'left', 'right', 'front', 'rear'])
    )
    expect(
      data.marks.map((m: { id: string; number: number; previous: boolean; editable: boolean }) => [
        m.id,
        m.number,
        m.previous,
        m.editable,
      ])
    ).toEqual([
      ['before', 1, true, false],
      ['now', 2, false, true],
    ])
    // Norwegian, from the app's own language rather than the workshop's.
    expect(data.marks[0].panelName).toBe('Panser')
  })

  it('does not open a job that is not on the technician’s list', async () => {
    state.ctx = { ...state.ctx, technicianIds: ['someone-else'] }
    expect((await GET(new Request('http://app.test/api'), job())).status).toBe(404)
  })
})

describe('a booking checked in', () => {
  it('stops being a placeholder the customer can cancel away at the first write', async () => {
    expect(JOB.status).toBe('scheduled')
    await PATCH(req({ mileage: 125400 }), job())
    // A cancelled online booking deletes only a job still `scheduled`.
    expect(JOB.status).toBe('pending')
  })

  it('is not moved by reading it', async () => {
    await GET(new Request('http://app.test/api'), job())
    expect(JOB.status).toBe('scheduled')
  })
})

describe('mileage and body', () => {
  it('records the mileage on the job and raises the vehicle’s, never lowers it', async () => {
    await PATCH(req({ mileage: 125400 }), job())
    expect(JOB.mileage).toBe(125400)
    expect(state.vehicle.mileage).toBe(125400)
    await PATCH(req({ mileage: 99 }), job())
    expect(JOB.mileage).toBe(99)
    expect(state.vehicle.mileage).toBe(125400)
  })

  it('chooses the drawing the vehicle is marked on', async () => {
    await PATCH(req({ bodyType: 'pickup' }), job())
    expect(state.vehicle.bodyType).toBe('pickup')
    expect((await PATCH(req({ bodyType: 'spaceship' }), job())).status).toBe(400)
  })
})

describe('marks', () => {
  it('records a tapped mark on this job’s drop-off', async () => {
    const { status, body } = await read(
      await addMark(
        req({
          bodyType: 'pickup',
          view: 'left',
          panel: 'left_front_door',
          x: 0.4,
          y: 0.6,
          kind: 'scratch',
        }),
        job()
      )
    )
    expect(status).toBe(201)
    expect(state.marks[0]).toMatchObject({
      serviceRecordId: JOB.id,
      vehicleId: 'veh-1',
      kind: 'scratch',
      severity: 'minor',
    })
    expect(body.data.marks).toHaveLength(1)
    // The vehicle now remembers the drawing it is marked on.
    expect(state.vehicle.bodyType).toBe('pickup')
  })

  it('refuses a mark that is not a mark, and a kind the workshop does not have', async () => {
    expect((await addMark(req({ view: 'left', x: 2 }), job())).status).toBe(400)
    expect(JOB.status).toBe('scheduled')
    const own = await addMark(
      req({
        bodyType: 'pickup',
        view: 'left',
        panel: 'left_front_door',
        x: 0.4,
        y: 0.6,
        kind: 'own_nope',
      }),
      job()
    )
    expect(own.status).toBe(400)
    // A refused mark is no arrival: the booking is left as it was.
    expect(JOB.status).toBe('scheduled')
  })

  it('changes and removes this check-in’s marks, never an earlier visit’s', async () => {
    state.marks = [
      mark({ id: 'now' }),
      mark({ id: 'before', serviceRecordId: OLD_JOB.id, recordedAt: new Date('2026-05-01') }),
    ]
    expect((await changeMark(req({ kind: 'chip' }), onMark('now'))).status).toBe(200)
    expect(state.marks.find((m) => m.id === 'now')?.kind).toBe('chip')
    expect((await changeMark(req({ kind: 'chip' }), onMark('before'))).status).toBe(404)
    expect((await removeMark(req(), onMark('before'))).status).toBe(404)
    expect((await removeMark(req(), onMark('now'))).status).toBe(200)
    expect(state.marks.map((m) => m.id)).toEqual(['before'])
  })
})

describe('earlier visits’ marks', () => {
  it('clears one found gone, and takes the clearing back', async () => {
    state.marks = [
      mark({ id: 'before', serviceRecordId: OLD_JOB.id, recordedAt: new Date('2026-05-01') }),
    ]
    const cleared = await read(await resolve(req({ resolved: true }), onMark('before')))
    expect(cleared.status).toBe(200)
    expect(state.marks[0].resolvedAt).toBeInstanceOf(Date)
    expect(cleared.body.data.marks).toEqual([])
    expect((await resolve(req({ resolved: false }), onMark('before'))).status).toBe(200)
    expect(state.marks[0].resolvedAt).toBeNull()
  })

  it('reopens only a mark this check-in could have cleared', async () => {
    // Cleared on a visit opened after this job: not this job's to reopen.
    state.marks = [
      mark({
        id: 'later',
        serviceRecordId: 'job-later',
        recordedAt: new Date('2026-11-20'),
        resolvedAt: new Date('2026-11-21'),
      }),
    ]
    const later = await resolve(req({ resolved: false }), onMark('later'))
    expect(later.status).toBe(409)
    expect(state.marks[0].resolvedAt).not.toBeNull()
  })

  it('tells this job’s page when an earlier mark is cleared', async () => {
    state.marks = [
      mark({ id: 'before', serviceRecordId: OLD_JOB.id, recordedAt: new Date('2026-05-01') }),
    ]
    vi.mocked(publishRecordChange).mockClear()
    await resolve(req({ resolved: true }), onMark('before'))
    expect(publishRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'serviceRecord', id: JOB.id, hint: 'conditionMarks' })
    )
  })

  it('does not clear a mark the desk confirmed a moment ago', async () => {
    // Read as open, then confirmed at the desk before the clear lands.
    const open = mark({
      id: 'before',
      serviceRecordId: OLD_JOB.id,
      recordedAt: new Date('2026-05-01'),
    })
    state.marks = [{ ...open, resolvedAt: new Date(), carriedToId: 'now' }]
    vi.mocked(db.conditionMark.findMany).mockResolvedValueOnce([
      { ...open, serviceRecord: { createdAt: OLD_JOB.createdAt }, inspection: null },
    ] as never)
    expect((await resolve(req({ resolved: true }), onMark('before'))).status).toBe(409)
    expect(state.marks[0].carriedToId).toBe('now')
  })

  it('does not clear this check-in’s own mark: that one is removed', async () => {
    state.marks = [mark({ id: 'now' })]
    expect((await resolve(req({ resolved: true }), onMark('now'))).status).toBe(400)
  })

  it('confirms every earlier mark as still there, onto this job', async () => {
    state.marks = [
      mark({ id: 'b1', serviceRecordId: OLD_JOB.id, recordedAt: new Date('2026-05-01T09:00:00Z') }),
      mark({
        id: 'b2',
        serviceRecordId: OLD_JOB.id,
        kind: 'rust',
        recordedAt: new Date('2026-05-01T09:01:00Z'),
      }),
    ]
    const { body } = await read(await carry(req(), job()))
    expect(body.data.carried).toBe(2)
    const own = body.data.marks.filter((m: { previous: boolean }) => !m.previous)
    expect(own.map((m: { kind: string }) => m.kind)).toEqual(['dent', 'rust'])
    expect(
      state.marks.filter((m) => m.serviceRecordId === OLD_JOB.id).every((m) => m.carriedToId)
    ).toBe(true)
  })
})

describe('drop-off photos', () => {
  const photo = async (slot: string, bytes: Uint8Array<ArrayBuffer>, type = 'image/png') => {
    const form = new FormData()
    form.append('slot', slot)
    form.append('file', new File([bytes], 'shot.png', { type }))
    return addPhoto(new Request('http://app.test/api', { method: 'POST', body: form }), job())
  }
  // The smallest valid PNG: one transparent pixel.
  const PNG = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    ),
    (c) => c.charCodeAt(0)
  )

  it('keeps the position it was taken from, off the invoice', async () => {
    const { status, body } = await read(await photo('front', PNG))
    expect(status).toBe(201)
    expect(body.data.photo.slot).toBe('front')
    expect(state.attachments[0]).toMatchObject({
      category: 'dropoff',
      description: 'front',
      includeInInvoice: false,
    })
  })

  it('takes a close-up onto a mark, and no more than a mark holds', async () => {
    state.marks = [mark({ id: 'now' })]
    const form = () => {
      const f = new FormData()
      f.append('file', new File([PNG], 'dent.png', { type: 'image/png' }))
      return new Request('http://app.test/api', { method: 'POST', body: f })
    }
    expect((await addMarkPhoto(form(), onMark('now'))).status).toBe(201)
    expect(state.marks[0].imageUrls).toHaveLength(1)
    state.marks[0].imageUrls = Array.from(
      { length: 10 },
      (_, i) => `/api/protected/files/org-1/services/p${i}.jpg`
    )
    expect((await addMarkPhoto(form(), onMark('now'))).status).toBe(409)
    expect(state.marks[0].imageUrls).toHaveLength(10)
  })

  it('refuses what is not a photo', async () => {
    expect(
      (await photo('front', new TextEncoder().encode('%PDF-1.4'), 'application/pdf')).status
    ).toBe(400)
    expect((await photo('rear', new TextEncoder().encode('not a png'))).status).toBe(400)
    expect(state.attachments).toEqual([])
  })
})
