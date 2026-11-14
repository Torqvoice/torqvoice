import { beforeEach, describe, expect, it, vi } from 'vitest'

const inspectionReminderSend = { findUnique: vi.fn(), update: vi.fn() }
const serviceRecord = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
}
const serviceRequest = { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }
const scheduledMessage = { create: vi.fn() }
const appSetting = { findUnique: vi.fn() }
// These tests are about workshop scoping, not files: the file manager and the
// files a delete collects have tests of their own (src/__tests__/lib/files).
vi.mock('@/lib/files/collect', () => ({
  serviceRecordFileUrls: vi.fn(async () => []),
  inspectionFileUrls: vi.fn(async () => []),
  vehicleFileUrls: vi.fn(async () => []),
  quoteFileUrls: vi.fn(async () => []),
  tireSetFileUrls: vi.fn(async () => []),
  inventoryPartFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  parseStoredFileUrl: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  db: { inspectionReminderSend, serviceRecord, serviceRequest, scheduledMessage, appSetting },
}))
const notify = vi.fn(async () => undefined)
vi.mock('@/lib/notify', () => ({ notify }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    `${key}${values ? ` ${JSON.stringify(values)}` : ''}`,
}))
const claimableResource = vi.fn()
vi.mock('@/features/inspection-reminders/Lib/booking', () => ({
  claimableResource,
  availabilityFor: vi.fn(async () => ({
    resources: [{ workBayId: 'bay-1' }],
    days: [],
    firstStart: null,
  })),
}))
const settings = {
  durationMinutes: 60,
  leadDays: 1,
  horizonWeeks: 4,
  walkInReserve: 0,
  linkValidDays: 7,
  bookingMode: 'direct' as 'direct' | 'request',
  phone: '+47 12345678',
  workshopName: 'Egeland Auto',
  templateSms: null,
  templateEmailSubject: null,
  templateEmailBody: null,
  workingHours: { start: '08:00', end: '16:00', includeWeekends: false, timeZone: 'Europe/Oslo' },
  timeZone: 'Europe/Oslo',
  timeZoneDetected: false,
}
vi.mock('@/features/inspection-reminders/Lib/settings', () => ({
  loadInspectionReminderSettings: vi.fn(async () => settings),
}))

const { cancelBooking, confirmBooking, getBookingPage } = await import(
  '@/features/inspection-reminders/Actions/bookingActions'
)

const { freezeOrganization, unfreezeOrganization, RESTORE_IN_PROGRESS_MESSAGE } = await import(
  '@/lib/backup/freeze'
)

const TOKEN = 'abcdefghijklmnopqrstuvwx'
const future = new Date(Date.now() + 3 * 86_400_000)
function send(over: Record<string, unknown> = {}) {
  return {
    id: 'send-1',
    organizationId: 'org-a',
    customerId: 'cust-1',
    vehicleId: 'v-1',
    dueAt: new Date(Date.now() + 30 * 86_400_000),
    expiresAt: new Date(Date.now() + 37 * 86_400_000),
    bookedAt: null,
    cancelledAt: null,
    bookedServiceRecordId: null,
    bookedServiceRequestId: null,
    channel: 'sms',
    recipient: '+47 90000000',
    campaign: { createdById: 'user-1' },
    vehicle: {
      year: 2019,
      make: 'Volvo',
      model: 'V90',
      licensePlate: 'EV11223',
      isArchived: false,
    },
    customer: { name: 'Kari' },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  settings.bookingMode = 'direct'
  settings.timeZone = 'Europe/Oslo'
  appSetting.findUnique.mockResolvedValue(null)
  serviceRecord.create.mockResolvedValue({ id: 'rec-1', vehicleId: 'v-1' })
  serviceRequest.create.mockResolvedValue({ id: 'req-1' })
  inspectionReminderSend.update.mockResolvedValue({})
  scheduledMessage.create.mockResolvedValue({ id: 'msg-1' })
  claimableResource.mockResolvedValue({ workBayId: 'bay-1' })
})

describe('booking link', () => {
  it('rejects a malformed or unknown token without touching anything', async () => {
    expect(await getBookingPage('short')).toBeNull()
    inspectionReminderSend.findUnique.mockResolvedValue(null)
    expect(await getBookingPage(TOKEN)).toBeNull()
    await expect(confirmBooking({ token: TOKEN, start: future.toISOString() })).rejects.toThrow(
      /not valid/
    )
    expect(serviceRecord.create).not.toHaveBeenCalled()
  })

  it('books a scheduled work order in the free bay, tells the desk and confirms to the customer', async () => {
    inspectionReminderSend.findUnique.mockResolvedValue(send())
    const result = await confirmBooking({
      token: TOKEN,
      start: future.toISOString(),
      note: 'Keys in the box',
    })
    expect(result.pendingApproval).toBe(false)
    const data = serviceRecord.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      status: 'scheduled',
      type: 'inspection',
      workBayId: 'bay-1',
      customerId: 'cust-1',
      vehicleId: 'v-1',
      organizationId: 'org-a',
      bookingSource: 'online',
      description: 'Keys in the box',
    })
    expect(data.endDateTime.getTime() - data.startDateTime.getTime()).toBe(60 * 60_000)
    expect(inspectionReminderSend.update.mock.calls[0][0].data.bookedServiceRecordId).toBe('rec-1')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a', type: 'online_booking' })
    )
    const confirmation = scheduledMessage.create.mock.calls[0][0].data
    expect(confirmation.channel).toBe('sms')
    expect(confirmation.recipient).toBe('+47 90000000')
    expect(confirmation.frequency).toBe('once')
  })

  it('tells the desk and the customer the booked time on the workshop clock, not the server clock', async () => {
    const slot = new Date('2026-12-02T07:00:00Z')
    const format = (timeZone?: string) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      }).format(slot)
    // A workshop whose clock reads differently from the machine running the
    // tests, wherever that is: no two of these agree at this hour, so at
    // least one is not the host's, and the test never passes by coincidence.
    const workshopZone = ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata'].find(
      (zone) => format(zone) !== format()
    ) as string
    settings.timeZone = workshopZone
    inspectionReminderSend.findUnique.mockResolvedValue(
      send({ dueAt: new Date('2026-12-20T00:00:00Z'), expiresAt: new Date('2026-12-30T00:00:00Z') })
    )
    vi.setSystemTime(new Date('2026-11-20T00:00:00Z'))
    try {
      await confirmBooking({ token: TOKEN, start: slot.toISOString() })
    } finally {
      vi.useRealTimers()
    }
    const onWorkshopClock = format(workshopZone)
    expect(format()).not.toBe(onWorkshopClock)
    const [notice] = notify.mock.calls as unknown as [{ message: string }][]
    expect(notice[0].message).toContain(onWorkshopClock)
    expect(scheduledMessage.create.mock.calls[0][0].data.body).toContain(onWorkshopClock)
  })

  it('refuses a slot that was taken in the meantime', async () => {
    inspectionReminderSend.findUnique.mockResolvedValue(send())
    claimableResource.mockResolvedValue(null)
    await expect(confirmBooking({ token: TOKEN, start: future.toISOString() })).rejects.toThrow(
      /just taken/
    )
    expect(serviceRecord.create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('refuses an expired link, but keeps showing the page', async () => {
    inspectionReminderSend.findUnique.mockResolvedValue(
      send({ expiresAt: new Date(Date.now() - 1000) })
    )
    const page = await getBookingPage(TOKEN)
    expect(page?.state).toBe('expired')
    expect(page?.workshop.phone).toBe('+47 12345678')
    await expect(confirmBooking({ token: TOKEN, start: future.toISOString() })).rejects.toThrow(
      /no longer/
    )
  })

  it('creates a request instead when the workshop wants to approve first', async () => {
    settings.bookingMode = 'request'
    inspectionReminderSend.findUnique.mockResolvedValue(send())
    const result = await confirmBooking({ token: TOKEN, start: future.toISOString() })
    expect(result.pendingApproval).toBe(true)
    expect(serviceRecord.create).not.toHaveBeenCalled()
    expect(serviceRequest.create.mock.calls[0][0].data.preferredDate).toEqual(future)
  })

  it('cancels only the placeholder the link created, and frees the link for a new time', async () => {
    inspectionReminderSend.findUnique.mockResolvedValue(
      send({ bookedAt: new Date(), bookedServiceRecordId: 'rec-1' })
    )
    serviceRecord.findUnique.mockResolvedValue({
      startDateTime: future,
      endDateTime: new Date(future.getTime() + 3_600_000),
      status: 'scheduled',
    })
    await cancelBooking(TOKEN)
    expect(serviceRecord.deleteMany.mock.calls[0][0].where).toMatchObject({
      id: 'rec-1',
      organizationId: 'org-a',
      bookingSource: 'online',
      status: 'scheduled',
    })
    expect(inspectionReminderSend.update.mock.calls[0][0].data.bookedServiceRecordId).toBeNull()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'online_booking_cancelled' })
    )
  })

  it('books and cancels nothing while the workshop is being restored', async () => {
    freezeOrganization('org-a')
    try {
      inspectionReminderSend.findUnique.mockResolvedValue(send())
      await expect(confirmBooking({ token: TOKEN, start: future.toISOString() })).rejects.toThrow(
        RESTORE_IN_PROGRESS_MESSAGE
      )
      expect(serviceRecord.create).not.toHaveBeenCalled()
      expect(serviceRequest.create).not.toHaveBeenCalled()

      inspectionReminderSend.findUnique.mockResolvedValue(
        send({ bookedAt: new Date(), bookedServiceRecordId: 'rec-1' })
      )
      serviceRecord.findUnique.mockResolvedValue({
        startDateTime: future,
        endDateTime: new Date(future.getTime() + 3_600_000),
        status: 'scheduled',
      })
      await expect(cancelBooking(TOKEN)).rejects.toThrow(RESTORE_IN_PROGRESS_MESSAGE)
      expect(serviceRecord.deleteMany).not.toHaveBeenCalled()
      expect(inspectionReminderSend.update).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    } finally {
      unfreezeOrganization('org-a')
    }
  })
})
