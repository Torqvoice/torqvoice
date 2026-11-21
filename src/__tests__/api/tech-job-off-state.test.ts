/**
 * @vitest-environment node
 *
 * The job the technician app reads, for a workshop that uses none of the
 * optional vehicle details. The app is installed from a store and the server
 * by whoever runs the workshop, so a workshop with everything off gets the
 * payload it always had: the reference and the fleet number are left out, key
 * and all. Only the keys `tech-api-features.ts` promises on every job are
 * added: `meters` (empty), `equipment` (null) and `documentLock`.
 *
 * The database answers with exactly the fields the route selects, so the
 * keys compared here are the route's own projection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ referenceOn: false, fleetNumberOn: false }))

/** A row with one value per selected field, nested selects followed. */
function project(select: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(select)) {
    if (value === true) row[key] = key === 'durationMinutes' ? 0 : `${key}-value`
    else if (value && typeof value === 'object' && 'select' in value) {
      const nested = project((value as { select: Record<string, unknown> }).select)
      // To-many relations are lists; vehicle and customer are single rows.
      row[key] = ['vehicle', 'customer'].includes(key) ? nested : [nested]
    }
  }
  return row
}

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: {
      findFirst: vi.fn(async ({ select }: { select: Record<string, unknown> }) => ({
        ...project(select),
        id: 'job-1',
        startDateTime: null,
        serviceDate: new Date('2026-11-20T08:00:00Z'),
      })),
    },
  },
}))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(async (_req: Request, handler: (ctx: unknown) => Promise<Response>) =>
      handler({ userId: 'user-1', organizationId: 'org-1', technicianIds: ['tech-1'] })
    ),
  }
})
vi.mock('@/features/workboard/Lib/jobTeam', () => ({ jobScopeFor: () => ({}) }))
vi.mock('@/features/time-tracking/Lib/timeEntries', () => ({
  getOpenEntry: vi.fn(async () => null),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/typeKeySetting')>()),
  isTypeKeyEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => state.fleetNumberOn),
}))
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => state.referenceOn),
}))
// What a workshop without meters or equipment gets from their libraries.
vi.mock('@/features/meters/Lib/appJobMeters.server', () => ({
  appJobMeters: vi.fn(async () => []),
}))
vi.mock('@/features/equipment/Lib/jobWorkOn.server', () => ({
  appJobEquipment: vi.fn(async () => null),
}))
vi.mock('@/lib/document-lock.server', () => ({
  getInvoiceLockState: vi.fn(async () => ({ locked: false, reason: null, unlockedAt: null })),
}))

import { GET } from '@/app/api/v1/tech/jobs/[id]/route'

/** The job's keys as the route answered before any optional detail existed. */
const MAIN_JOB_KEYS = [
  'id',
  'title',
  'description',
  'concerns',
  'status',
  'diagnosticNotes',
  'mileage',
  'startDateTime',
  'endDateTime',
  'vehicle',
  'customer',
  'partItems',
  'laborItems',
  'attachments',
  'timeEntries',
  'isRunning',
  'runningSince',
  'totalMinutes',
]
const MAIN_VEHICLE_KEYS = [
  'id',
  'make',
  'model',
  'year',
  'licensePlate',
  'vin',
  'hsn',
  'tsn',
  'mileage',
  'customer',
]
/** Promised on every job by tech-api-features.ts, whatever the workshop uses. */
const ALWAYS_PRESENT = ['meters', 'equipment', 'documentLock']

async function job() {
  const res = await GET(new Request('https://app.test/api/v1/tech/jobs/job-1'), {
    params: Promise.resolve({ id: 'job-1' }),
  })
  expect(res.status).toBe(200)
  // Serialised as the app receives it: an undefined value would vanish here.
  const body = JSON.parse(JSON.stringify(await res.json()))
  return (body.data ?? body) as Record<string, unknown> & { vehicle: Record<string, unknown> }
}

beforeEach(() => {
  state.referenceOn = false
  state.fleetNumberOn = false
})

describe('the technician app’s job, for a workshop with every optional detail off', () => {
  it('has the keys it always had, and only the ones every job is promised besides', async () => {
    const body = await job()
    expect(Object.keys(body).sort()).toEqual([...MAIN_JOB_KEYS, ...ALWAYS_PRESENT].sort())
    expect(Object.keys(body.vehicle).sort()).toEqual([...MAIN_VEHICLE_KEYS].sort())
    expect(body).not.toHaveProperty('customerReference')
    expect(body).not.toHaveProperty('serviceDate')
    expect(body.vehicle).not.toHaveProperty('fleetNumber')
    expect(body.meters).toEqual([])
    expect(body.equipment).toBeNull()
    expect(body.documentLock).toEqual({ locked: false, reason: null })
  })

  it('carries the reference and the fleet number once the workshop turns them on', async () => {
    state.referenceOn = true
    state.fleetNumberOn = true
    const body = await job()
    expect(body.customerReference).toBe('customerReference-value')
    expect(body.vehicle.fleetNumber).toBe('fleetNumber-value')
  })
})
