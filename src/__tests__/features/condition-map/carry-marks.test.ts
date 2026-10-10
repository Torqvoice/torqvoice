/**
 * Confirming every earlier mark as still there in one go: each is recorded
 * again on the sheet in hand as this visit's own and the earlier one closed,
 * so the vehicle never carries a dent twice, an earlier visit's record stays
 * as it was, and asking twice changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string }

const { store, required, audits } = vi.hoisted(() => ({
  store: {
    marks: [] as Row[],
    inspections: [] as Row[],
    jobs: [] as Row[],
    next: 0,
  },
  required: [] as unknown[],
  audits: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn(async () => undefined) }))
vi.mock('@/lib/db', () => {
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value)
  const sheetOf = (rows: Row[], id: unknown) => {
    const row = rows.find((r) => r.id === id)
    return row ? { createdAt: row.createdAt } : null
  }
  const conditionMark = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      store.marks
        .filter((row) => matches(row, where))
        .map((row) => ({
          ...row,
          serviceRecord: sheetOf(store.jobs, row.serviceRecordId),
          inspection: sheetOf(store.inspections, row.inspectionId),
        })),
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }) => {
      const rows = store.marks.filter((row) => matches(row, where))
      for (const row of rows) Object.assign(row, data)
      return { count: rows.length }
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { resolvedAt: null, ...data, id: `new_${++store.next}` } as Row
      store.marks.push(row)
      return { ...row }
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = store.marks.find((r) => r.id === where.id)
      if (!row) throw new Error('not found')
      Object.assign(row, data)
      return { ...row }
    },
  }
  const db = {
    conditionMark,
    inspection: {
      // The check asked for arrives nested in the select.
      findFirst: async (args: {
        where: Record<string, unknown>
        select: { items: { where: { id: string } } }
      }) => {
        const row = store.inspections.find((r) => matches(r, args.where))
        if (!row) return null
        const asked = args.select.items.where.id
        return { ...row, items: (row.items as Row[]).filter((item) => item.id === asked) }
      },
    },
    serviceRecord: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        store.jobs.find((r) => matches(r, where)) ?? null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  }
  return { db }
})

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>,
    options?: {
      requiredPermissions?: unknown[]
      audit?: (args: { result: unknown }) => unknown
    }
  ) => {
    required.push(options?.requiredPermissions ?? null)
    try {
      const data = await fn({ organizationId: 'org', userId: 'user' })
      if (typeof options?.audit === 'function') audits.push(options.audit({ result: data }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { carryConditionMarks } from '@/features/condition-map/Actions/conditionMarkActions'
import { loadVehicleConditionMarks } from '@/features/condition-map/Lib/loadMarks.server'
import { type MarkScope, splitMarks } from '@/features/condition-map/Lib/marks'
import { marksAsOf } from '@/features/inspections/Pdf/buildCertificatePrint'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const PHOTO = '/api/protected/files/org/services/3f0c2a1e-1111-4222-8333-444455556666.jpg'

const mark = (over: Partial<Row>): Row => ({
  id: 'm',
  organizationId: 'org',
  vehicleId: 'car',
  inspectionId: null,
  inspectionItemId: null,
  serviceRecordId: null,
  bodyType: 'estate',
  view: 'left',
  panel: 'left_front_door',
  x: 0.25,
  y: 0.75,
  kind: 'dent',
  severity: 'minor',
  note: null,
  imageUrls: [],
  recordedAt: new Date('2026-06-01T10:00:00Z'),
  resolvedAt: null,
  ...over,
})

/** The sheets as the pages scope them. */
const oldJob: MarkScope = { serviceRecordId: 'job_old', openedAt: new Date('2026-06-01T09:00:00Z') }
const oldInspection: MarkScope = {
  linkedInspectionId: 'insp_old',
  openedAt: new Date('2026-07-01T09:00:00Z'),
}
const thisJob: MarkScope = {
  serviceRecordId: 'job_now',
  openedAt: new Date('2026-09-01T09:00:00Z'),
}
const nextJob: MarkScope = {
  serviceRecordId: 'job_next',
  openedAt: new Date('2026-10-01T09:00:00Z'),
}

const split = async (scope: MarkScope) =>
  splitMarks(await loadVehicleConditionMarks('org', 'car'), scope)
const ids = (marks: { id: string }[]) => marks.map((m) => m.id)

beforeEach(() => {
  vi.clearAllMocks()
  required.length = 0
  audits.length = 0
  store.next = 0
  store.jobs = [
    {
      id: 'job_old',
      organizationId: 'org',
      vehicleId: 'car',
      inspectionId: null,
      createdAt: oldJob.openedAt,
    },
    {
      id: 'job_now',
      organizationId: 'org',
      vehicleId: 'car',
      inspectionId: null,
      createdAt: thisJob.openedAt,
    },
    {
      id: 'job_next',
      organizationId: 'org',
      vehicleId: 'car',
      inspectionId: null,
      createdAt: nextJob.openedAt,
    },
    {
      id: 'job_theirs',
      organizationId: 'other',
      vehicleId: 'car',
      inspectionId: null,
      createdAt: thisJob.openedAt,
    },
    {
      id: 'job_other_car',
      organizationId: 'org',
      vehicleId: 'van',
      inspectionId: null,
      createdAt: thisJob.openedAt,
    },
  ]
  store.inspections = [
    {
      id: 'insp_old',
      organizationId: 'org',
      vehicleId: 'car',
      status: 'completed',
      createdAt: oldInspection.openedAt,
      items: [{ id: 'check_old' }],
    },
    {
      id: 'insp_now',
      organizationId: 'org',
      vehicleId: 'car',
      status: 'in_progress',
      createdAt: new Date('2026-09-02T09:00:00Z'),
      items: [{ id: 'check_in' }, { id: 'hand_back' }],
    },
  ]
  store.marks = [
    mark({
      id: 'dent',
      serviceRecordId: 'job_old',
      severity: 'major',
      note: 'Size of a coin',
      imageUrls: [PHOTO],
    }),
    mark({
      id: 'scratch',
      inspectionId: 'insp_old',
      inspectionItemId: 'check_old',
      kind: 'scratch',
      view: 'rear',
      panel: 'rear_bumper',
      x: 0.6,
      y: 0.4,
      recordedAt: new Date('2026-07-01T10:00:00Z'),
    }),
    // Repaired long ago: history, never carried.
    mark({
      id: 'repaired',
      serviceRecordId: 'job_old',
      kind: 'chip',
      recordedAt: new Date('2026-06-01T10:05:00Z'),
      resolvedAt: new Date('2026-07-01T10:30:00Z'),
    }),
    // Another vehicle's, and another workshop's on the same vehicle id.
    mark({ id: 'van_dent', vehicleId: 'van', serviceRecordId: 'job_other_car' }),
    mark({ id: 'theirs', organizationId: 'other', serviceRecordId: 'job_theirs' }),
  ]
})

describe('confirming every earlier mark on a work order', () => {
  it("records each as the job's own, with everything the earlier mark said", async () => {
    expect(ids((await split(thisJob)).previous)).toEqual(['dent', 'scratch'])

    const result = await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    expect(result.success).toBe(true)
    expect(result.data?.carried).toEqual(['dent', 'scratch'])

    const { own, previous } = await split(thisJob)
    expect(previous).toEqual([])
    expect(own).toHaveLength(2)
    expect(own.every((m) => m.serviceRecordId === 'job_now' && m.inspectionId === null)).toBe(true)
    expect(
      own.map((m) => [
        m.kind,
        m.severity,
        m.note,
        m.bodyType,
        m.view,
        m.panel,
        m.x,
        m.y,
        m.imageUrls,
      ])
    ).toEqual([
      ['dent', 'major', 'Size of a coin', 'estate', 'left', 'left_front_door', 0.25, 0.75, [PHOTO]],
      ['scratch', 'minor', null, 'estate', 'rear', 'rear_bumper', 0.6, 0.4, []],
    ])
    // Numbered by when they were recorded: each has a moment of its own.
    const moments = own.map((m) => new Date(m.recordedAt).getTime())
    expect(moments[1]).toBeGreaterThan(moments[0])
    expect(ids(result.data?.marks ?? [])).toEqual(ids(own))
  })

  it('closes the earlier ones, so a later visit meets each dent once', async () => {
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    const later = await split(nextJob)
    expect(later.own).toEqual([])
    expect(later.previous.map((m) => m.kind)).toEqual(['dent', 'scratch'])
    expect(later.previous.every((m) => m.serviceRecordId === 'job_now')).toBe(true)
    const open = store.marks.filter(
      (m) => m.vehicleId === 'car' && m.organizationId === 'org' && !m.resolvedAt
    )
    expect(open).toHaveLength(2)
    // The earlier rows are kept as history, closed by whoever confirmed them
    // and pointing at the mark that took their place.
    expect(store.marks.find((m) => m.id === 'dent')).toMatchObject({
      serviceRecordId: 'job_old',
      resolvedById: 'user',
      carriedToId: 'new_1',
    })
    expect(store.marks.find((m) => m.id === 'scratch')).toMatchObject({ carriedToId: 'new_2' })
  })

  it('leaves the earlier sheet its own record of the dent', async () => {
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    // Closed on the car, but not repaired: the old job still prints what it
    // found at drop-off, and does not meet the newer copy as "earlier".
    const { own, previous } = await split(oldJob)
    expect(ids(own)).toEqual(['dent'])
    expect(ids(previous)).toEqual([])
  })

  it('keeps the photo on both marks, so the file manager still counts two rows', async () => {
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    const holding = store.marks.filter((m) => (m.imageUrls as string[]).includes(PHOTO))
    expect(ids(holding)).toEqual(['dent', 'new_1'])
  })

  it("leaves another vehicle's marks, another workshop's and repaired ones alone", async () => {
    const before = structuredClone(
      store.marks.filter((m) => ['repaired', 'van_dent', 'theirs'].includes(m.id))
    )
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    expect(store.marks.filter((m) => ['repaired', 'van_dent', 'theirs'].includes(m.id))).toEqual(
      before
    )
    expect(store.marks).toHaveLength(7)
  })
})

describe('the earlier visits', () => {
  it('never show the marks recorded again on a later sheet', async () => {
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    for (const scope of [oldJob, oldInspection]) {
      const { own, previous } = await split(scope)
      expect([...own, ...previous].some((m) => m.serviceRecordId === 'job_now')).toBe(false)
    }
  })

  it('split a completed inspection as it stood when it was completed', async () => {
    const completedAt = new Date('2026-07-01T12:00:00Z')
    const asCompleted = async () =>
      splitMarks(
        marksAsOf(await loadVehicleConditionMarks('org', 'car'), completedAt),
        oldInspection
      )
    const before = await asCompleted()
    expect(ids(before.own)).toEqual(['scratch'])
    expect(ids(before.previous)).toEqual(['dent'])

    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    const after = await asCompleted()
    expect(ids(after.own)).toEqual(ids(before.own))
    expect(ids(after.previous)).toEqual(ids(before.previous))
  })

  it('are not carried back onto a sheet opened before they were', async () => {
    store.marks.push(mark({ id: 'newer', serviceRecordId: 'job_next' }))
    const result = await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    expect(result.data?.carried).toEqual(['dent', 'scratch'])
    expect(store.marks.find((m) => m.id === 'newer')?.resolvedAt).toBeNull()
  })
})

describe('asking again', () => {
  it('changes nothing the second time', async () => {
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    const after = structuredClone(store.marks)
    const again = await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    expect(again).toMatchObject({ success: true, data: { marks: [], carried: [] } })
    expect(store.marks).toEqual(after)
    // Only the click that carried something is written to the log.
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'conditionMark.carry',
        details: { key: 'condition_mark_carry', params: { count: 2 } },
      }),
      null,
    ])
  })

  it('by two people at once records each mark once', async () => {
    const [first, second] = await Promise.all([
      carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' }),
      carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' }),
    ])
    const carried = [...(first.data?.carried ?? []), ...(second.data?.carried ?? [])]
    expect(carried.sort()).toEqual(['dent', 'scratch'])
    expect((await split(thisJob)).own).toHaveLength(2)
    expect(store.marks).toHaveLength(7)
  })

  it('skips a mark somebody cleared as repaired a moment before', async () => {
    const { db } = await import('@/lib/db')
    const read = db.conditionMark.findMany
    // Read as open, then cleared before the transaction reaches it.
    vi.spyOn(db.conditionMark, 'findMany').mockImplementationOnce((async (args: never) => {
      const rows = await read(args)
      store.marks.find((m) => m.id === 'scratch')!.resolvedAt = new Date()
      return rows
    }) as never)
    const result = await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    expect(result.data?.carried).toEqual(['dent'])
    expect(ids((await split(thisJob)).own)).toEqual(['new_1'])
  })
})

describe('confirming every earlier mark on an inspection', () => {
  it("records them on the check in hand, and leaves the inspection's other check alone", async () => {
    store.marks.push(
      mark({
        id: 'checked_in',
        inspectionId: 'insp_now',
        inspectionItemId: 'check_in',
        recordedAt: new Date('2026-09-02T10:00:00Z'),
      })
    )
    const result = await carryConditionMarks({
      vehicleId: 'car',
      inspectionId: 'insp_now',
      inspectionItemId: 'hand_back',
    })
    expect(result.data?.carried).toEqual(['dent', 'scratch'])
    const scope = {
      inspectionId: 'insp_now',
      inspectionItemId: 'hand_back',
      openedAt: new Date('2026-09-02T09:00:00Z'),
    }
    const { own, previous } = await split(scope)
    expect(previous).toEqual([])
    expect(ids(own)).toEqual(['checked_in', 'new_1', 'new_2'])
    expect(
      own.slice(1).every((m) => m.inspectionItemId === 'hand_back' && m.serviceRecordId === null)
    ).toBe(true)
    expect(store.marks.find((m) => m.id === 'checked_in')?.resolvedAt).toBeNull()
  })

  it('asks for the right to change the sheet and the right to close a mark', async () => {
    await carryConditionMarks({
      vehicleId: 'car',
      inspectionId: 'insp_now',
      inspectionItemId: 'hand_back',
    })
    await carryConditionMarks({ vehicleId: 'car', serviceRecordId: 'job_now' })
    const vehicles = { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }
    expect(required).toEqual([
      [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }, vehicles],
      [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }, vehicles],
    ])
  })
})

describe('a sheet that may not be written on', () => {
  const untouched = async (input: unknown, error: string) => {
    const before = structuredClone(store.marks)
    const result = await carryConditionMarks(input)
    expect(result).toMatchObject({ success: false, error })
    expect(store.marks).toEqual(before)
  }

  it('a completed inspection', async () => {
    store.inspections[1].status = 'completed'
    await untouched(
      { vehicleId: 'car', inspectionId: 'insp_now', inspectionItemId: 'hand_back' },
      'Reopen the inspection to change its condition map'
    )
  })

  it("another workshop's work order", async () => {
    await untouched({ vehicleId: 'car', serviceRecordId: 'job_theirs' }, 'Work order not found')
  })

  it("another vehicle's work order or inspection", async () => {
    await untouched({ vehicleId: 'car', serviceRecordId: 'job_other_car' }, 'Work order not found')
    await untouched(
      { vehicleId: 'van', inspectionId: 'insp_now', inspectionItemId: 'hand_back' },
      'Inspection not found'
    )
  })

  it('a check the inspection does not have', async () => {
    await untouched(
      { vehicleId: 'car', inspectionId: 'insp_now', inspectionItemId: 'check_old' },
      'Check not found'
    )
  })

  it('a sheet named by halves, or two at once', async () => {
    await untouched({ vehicleId: 'car', inspectionId: 'insp_now' }, 'Invalid sheet')
    await untouched({ vehicleId: 'car' }, 'Invalid sheet')
    await untouched(
      {
        vehicleId: 'car',
        serviceRecordId: 'job_now',
        inspectionId: 'insp_now',
        inspectionItemId: 'hand_back',
      },
      'Invalid sheet'
    )
  })
})
