import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspectionReminderSettings } from '@/features/inspection-reminders/Lib/settings'

const vehicleInspectionStatus = { findMany: vi.fn() }
const inspectionReminderSend = { findMany: vi.fn(), create: vi.fn(), update: vi.fn() }
const inspectionReminderCampaign = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
const scheduledMessage = { create: vi.fn() }
const tx = { inspectionReminderSend, scheduledMessage }
const db = {
  vehicleInspectionStatus,
  inspectionReminderSend,
  inspectionReminderCampaign,
  scheduledMessage,
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
}
vi.mock('@/lib/db', () => ({ db }))

const { reminderCandidates, COOLDOWN_DAYS } = await import(
  '@/features/inspection-reminders/Lib/candidates'
)
const { createCampaign } = await import('@/features/inspection-reminders/Lib/campaign')

const DAY = 86_400_000
const now = new Date('2026-09-03T10:00:00Z')

const settings: InspectionReminderSettings = {
  durationMinutes: 60,
  leadDays: 1,
  horizonWeeks: 4,
  walkInReserve: 0,
  linkValidDays: 7,
  bookingMode: 'direct',
  phone: '+47 12345678',
  workshopName: 'Egeland Auto',
  templateSms: null,
  templateEmailSubject: null,
  templateEmailBody: null,
  workingHours: { start: '00:00', end: '23:59', includeWeekends: true, timeZone: 'Europe/Oslo' },
  timeZone: 'Europe/Oslo',
  timeZoneDetected: false,
}

function customer(
  over: Partial<{
    id: string
    name: string
    phone: string | null
    email: string | null
    telegramChatId: string | null
    reminderOptOut: boolean
  }> = {}
) {
  return {
    id: 'cust-1',
    name: 'Kari',
    phone: '+47 90000000',
    email: 'kari@example.com',
    telegramChatId: null,
    reminderOptOut: false,
    ...over,
  }
}

function row(
  over: Record<string, unknown> = {},
  cust: ReturnType<typeof customer> | null = customer()
) {
  return {
    dueAt: new Date(now.getTime() + 20 * DAY),
    registered: true,
    vehicle: {
      id: 'v-1',
      year: 2019,
      make: 'Volvo',
      model: 'V90',
      licensePlate: 'EV11223',
      soldReportedAt: null,
      customer: cust,
      ...over,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vehicleInspectionStatus.findMany.mockResolvedValue([])
  inspectionReminderSend.findMany.mockResolvedValue([])
  inspectionReminderCampaign.findUnique.mockResolvedValue(null)
  inspectionReminderCampaign.create.mockResolvedValue({ id: 'camp-1' })
  inspectionReminderSend.create.mockResolvedValue({ id: 'send-1' })
  scheduledMessage.create.mockResolvedValue({ id: 'msg-1' })
})

describe('reminder candidates', () => {
  it('asks only for this organisation’s live vehicles inside the window', async () => {
    await reminderCandidates({ organizationId: 'org-a', windowDays: 90, channel: 'sms', now })
    const where = vehicleInspectionStatus.findMany.mock.calls[0][0].where
    expect(where.organizationId).toBe('org-a')
    expect(where.vehicle).toEqual({ isArchived: false })
    expect(where.dueAt.lte).toEqual(new Date(now.getTime() + 90 * DAY))
  })

  it('includes a reachable customer and names every reason for leaving one out', async () => {
    vehicleInspectionStatus.findMany.mockResolvedValue([
      row(),
      row({ id: 'v-none' }, null),
      row({ id: 'v-opt' }, customer({ id: 'c-opt', reminderOptOut: true })),
      row({ id: 'v-nophone' }, customer({ id: 'c-nophone', phone: null })),
      row({ id: 'v-sold', soldReportedAt: new Date() }),
      { ...row({ id: 'v-off' }), registered: false },
      row({ id: 'v-done' }),
      row({ id: 'v-booked' }),
      row({ id: 'v-recent' }, customer({ id: 'c-recent' })),
    ])
    const due = new Date(now.getTime() + 20 * DAY)
    inspectionReminderSend.findMany.mockResolvedValue([
      {
        vehicleId: 'v-done',
        customerId: 'cust-1',
        dueAt: due,
        createdAt: new Date(now.getTime() - 5 * DAY),
        bookedAt: null,
      },
      {
        vehicleId: 'v-booked',
        customerId: 'cust-1',
        dueAt: due,
        createdAt: new Date(now.getTime() - 5 * DAY),
        bookedAt: new Date(),
      },
      // Same vehicle, a different (older) deadline, inside the cooldown.
      {
        vehicleId: 'v-recent',
        customerId: 'c-recent',
        dueAt: new Date(now.getTime() - 300 * DAY),
        createdAt: new Date(now.getTime() - (COOLDOWN_DAYS - 1) * DAY),
        bookedAt: null,
      },
    ])
    const list = await reminderCandidates({
      organizationId: 'org-a',
      windowDays: 90,
      channel: 'sms',
      now,
    })
    const byId = Object.fromEntries(list.map((c) => [c.vehicleId, c]))
    expect(byId['v-1'].excluded).toBeNull()
    expect(byId['v-1'].recipient).toBe('+47 90000000')
    expect(byId['v-none'].excluded).toBe('noCustomer')
    expect(byId['v-opt'].excluded).toBe('optedOut')
    expect(byId['v-nophone'].excluded).toBe('noRecipient')
    expect(byId['v-sold'].excluded).toBe('soldReported')
    expect(byId['v-off'].excluded).toBe('notRegistered')
    expect(byId['v-done'].excluded).toBe('alreadyReminded')
    expect(byId['v-booked'].excluded).toBe('booked')
    expect(byId['v-recent'].excluded).toBe('cooldown')
  })

  it('picks the recipient by channel', async () => {
    vehicleInspectionStatus.findMany.mockResolvedValue([row()])
    const email = await reminderCandidates({
      organizationId: 'org-a',
      windowDays: 90,
      channel: 'email',
      now,
    })
    expect(email[0].recipient).toBe('kari@example.com')
    const telegram = await reminderCandidates({
      organizationId: 'org-a',
      windowDays: 90,
      channel: 'telegram',
      now,
    })
    expect(telegram[0].excluded).toBe('noRecipient')
  })
})

describe('createCampaign', () => {
  const draft = {
    organizationId: 'org-a',
    userId: 'user-1',
    idempotencyToken: 'tok-1234567890abcdef',
    windowDays: 90 as const,
    channel: 'sms' as const,
    subject: null,
    body: 'Hi {customerName}, {vehicle} ({plate}) is due {dueDate}. {bookingLink}',
    vehicleIds: ['v-1'],
    appUrl: 'https://app.test',
    locale: 'en-GB',
    settings,
  }

  it('writes a send row first, then the message, with the link in the body', async () => {
    vehicleInspectionStatus.findMany.mockResolvedValue([row()])
    const outcome = await createCampaign(draft)
    expect(outcome).toEqual({ campaignId: 'camp-1', created: 1, skipped: 0, alreadyExisted: false })
    const send = inspectionReminderSend.create.mock.calls[0][0].data
    expect(send.vehicleId).toBe('v-1')
    expect(send.customerId).toBe('cust-1')
    expect(send.organizationId).toBe('org-a')
    expect(send.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(send.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 7 * DAY - 1000)
    const message = scheduledMessage.create.mock.calls[0][0].data
    expect(message.body).toContain(`https://app.test/b/${send.token}`)
    expect(message.body).toContain('Volvo V90 (EV11223)')
    expect(message.body).not.toContain('{')
    expect(message.frequency).toBe('once')
    expect(message.status).toBe('scheduled')
    expect(message.recipient).toBe('+47 90000000')
    expect(inspectionReminderCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { recipientCount: 1 },
    })
  })

  it('returns the existing campaign for a repeated token and writes nothing', async () => {
    inspectionReminderCampaign.findUnique.mockResolvedValue({ id: 'camp-old', recipientCount: 3 })
    const outcome = await createCampaign(draft)
    expect(outcome).toEqual({
      campaignId: 'camp-old',
      created: 3,
      skipped: 0,
      alreadyExisted: true,
    })
    expect(inspectionReminderCampaign.create).not.toHaveBeenCalled()
    expect(scheduledMessage.create).not.toHaveBeenCalled()
  })

  it('skips a vehicle whose deadline already has a send row, and never messages it', async () => {
    vehicleInspectionStatus.findMany.mockResolvedValue([
      row(),
      row({ id: 'v-2' }, customer({ id: 'c-2' })),
    ])
    inspectionReminderSend.create
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockResolvedValueOnce({ id: 'send-2' })
    const outcome = await createCampaign({ ...draft, vehicleIds: ['v-1', 'v-2'] })
    expect(outcome.created).toBe(1)
    expect(outcome.skipped).toBe(1)
    expect(scheduledMessage.create).toHaveBeenCalledTimes(1)
    expect(scheduledMessage.create.mock.calls[0][0].data.vehicleId).toBe('v-2')
  })

  it('only writes to vehicles that were on the reviewed list and are still includable', async () => {
    vehicleInspectionStatus.findMany.mockResolvedValue([
      row(),
      row({ id: 'v-opt' }, customer({ id: 'c-opt', reminderOptOut: true })),
      row({ id: 'v-unticked' }, customer({ id: 'c-3' })),
    ])
    const outcome = await createCampaign({ ...draft, vehicleIds: ['v-1', 'v-opt'] })
    expect(outcome.created).toBe(1)
    expect(inspectionReminderSend.create.mock.calls.map((c) => c[0].data.vehicleId)).toEqual([
      'v-1',
    ])
  })
})
