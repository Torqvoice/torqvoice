/**
 * The photos and video a customer sends with a request for a visit, as the
 * server takes them. The form hands over the stored urls the upload route
 * answered with; the action stores only those, so a request can never point
 * at another workshop's file or at one of the workshop's own, and the
 * workshop is told that files came with it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    vehicle: { findFirst: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn() },
    serviceRequest: { create: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Europe/Oslo'),
}))
vi.mock('@/features/workshop-calendar/Lib/loadCalendar.server', () => ({
  loadWorkshopCalendar: vi.fn(),
}))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))
vi.mock('@/features/portal/Lib/sendServiceRequestAlert', () => ({
  sendServiceRequestAlert: vi.fn(async () => 0),
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))

import { createServiceRequest } from '@/features/portal/Actions/portalActions'
import { portalUploadFileName } from '@/features/portal/Lib/portalUploadOwner.server'
import { freezeOrganization, unfreezeOrganization } from '@/lib/backup/freeze'
import { sendServiceRequestAlert } from '@/features/portal/Lib/sendServiceRequestAlert'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

const stored = (name: string, org = 'org1', folder = 'portal-uploads') =>
  `/api/protected/files/${org}/${folder}/${name}`
process.env.BETTER_AUTH_SECRET = 'a-secret-for-service-request-files'
// Uploads of the signed-in customer: the name says whose a file is.
const PHOTO = stored(portalUploadFileName('org1', 'c1', 'jpg'))
const VIDEO = stored(portalUploadFileName('org1', 'c1', 'mp4'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadWorkshopCalendar).mockResolvedValue({
    enabled: true,
    calendar: {
      timeZone: 'Europe/Oslo',
      week: defaultWeek('08:00', '17:00'),
      closures: [],
      absences: [],
    },
  })
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    id: 'v1',
    make: 'Volvo',
    model: 'V60',
    licensePlate: 'EK 12345',
  } as never)
  vi.mocked(db.customer.findUnique).mockResolvedValue({
    name: 'Kari Nordmann',
    email: 'kari@example.com',
    phone: null,
  } as never)
  vi.mocked(db.serviceRequest.create).mockImplementation((async ({ data }: { data: object }) => ({
    id: 'req-1',
    ...data,
  })) as never)
})

const ask = (over: Partial<Parameters<typeof createServiceRequest>[0]> = {}) =>
  createServiceRequest({ vehicleId: 'v1', description: 'A knocking noise', ...over })

describe('a request for a visit with photos', () => {
  it('stores the files with the request, in order, and tells the workshop they came', async () => {
    const res = await ask({ attachments: [PHOTO, VIDEO] })

    expect(res.success).toBe(true)
    expect(db.serviceRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'A knocking noise',
        attachments: [PHOTO, VIDEO],
        customerId: 'c1',
        vehicleId: 'v1',
        organizationId: 'org1',
      }),
    })
    expect(vi.mocked(notify).mock.calls[0][0].message).toContain('2 photos or videos attached')
    expect(sendServiceRequestAlert).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentCount: 2 })
    )
  })

  it('stores none for a request without files, and says nothing of them', async () => {
    await ask()
    expect(vi.mocked(db.serviceRequest.create).mock.calls[0][0].data.attachments).toEqual([])
    expect(vi.mocked(notify).mock.calls[0][0].message).not.toContain('attached')
  })

  it.each([
    [
      "another customer's upload in the same workshop",
      stored(portalUploadFileName('org1', 'someone-else', 'jpg')),
    ],
    [
      'a file the staff put in the portal folder',
      stored('11111111-1111-4111-8111-111111111111.jpg'),
    ],
    [
      'a file of another workshop',
      stored(portalUploadFileName('org-other', 'c1', 'jpg'), 'org-other'),
    ],
    ["one of the workshop's own files", stored('job.jpg', 'org1', 'services')],
    ['an address on another site', 'https://example.com/a.jpg'],
    ['a path that climbs out of the folder', stored('../services/job.jpg')],
  ])('refuses %s, and creates nothing', async (_what, url) => {
    const res = await ask({ attachments: [PHOTO, url] })
    expect(res.success).toBe(false)
    expect(db.serviceRequest.create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('refuses more files than the form allows', async () => {
    const many = Array.from({ length: 7 }, () => stored(portalUploadFileName('org1', 'c1', 'jpg')))
    expect((await ask({ attachments: many })).success).toBe(false)
    expect(db.serviceRequest.create).not.toHaveBeenCalled()
  })

  it('creates nothing while the workshop is being restored from a backup', async () => {
    freezeOrganization('org1')
    try {
      const res = await ask({ attachments: [PHOTO] })
      expect(res.success).toBe(false)
      expect(db.serviceRequest.create).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    } finally {
      unfreezeOrganization('org1')
    }
  })

  it('counts a file named twice once', async () => {
    await ask({ attachments: [PHOTO, PHOTO] })
    expect(vi.mocked(db.serviceRequest.create).mock.calls[0][0].data.attachments).toEqual([PHOTO])
  })

  it('refuses a request with no words at all', async () => {
    expect((await ask({ description: '   ' })).success).toBe(false)
    expect(db.serviceRequest.create).not.toHaveBeenCalled()
  })
})

describe('the part of the day', () => {
  it('is kept with a day, and only the two the form offers', async () => {
    await ask({ preferredDate: '2027-03-02', preferredTime: 'morning' })
    expect(vi.mocked(db.serviceRequest.create).mock.calls[0][0].data.preferredTime).toBe('morning')

    await ask({ preferredDate: '2027-03-02', preferredTime: 'midnight' as never })
    expect(vi.mocked(db.serviceRequest.create).mock.calls[1][0].data.preferredTime).toBeNull()
  })

  it('is dropped when the customer picked no day', async () => {
    await ask({ preferredTime: 'afternoon' })
    expect(vi.mocked(db.serviceRequest.create).mock.calls[0][0].data.preferredTime).toBeNull()
  })
})
