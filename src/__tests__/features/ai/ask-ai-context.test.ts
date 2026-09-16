import { beforeEach, describe, expect, it, vi } from 'vitest'

const vehicle = { findFirst: vi.fn() }
const customer = { findFirst: vi.fn() }
const serviceRecord = { findMany: vi.fn() }

vi.mock('@/lib/db', () => ({ db: { vehicle, customer, serviceRecord } }))

const { buildAskAiContext, askAiSystemPrompt, MAX_CONTEXT_CHARS } = await import(
  '@/features/ai/Lib/askAiContext'
)

const ORG = 'org_1'
const options = {
  showMoney: true,
  currencyCode: 'NOK',
  unitSystem: 'metric' as const,
  timeZone: 'Europe/Oslo',
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job_1',
    title: 'Brake pads',
    description: 'Front pads replaced',
    diagnosticNotes: null,
    type: 'repair',
    status: 'completed',
    cost: 0,
    totalAmount: 2500,
    mileage: 120000,
    serviceDate: new Date('2026-05-02T10:00:00Z'),
    startDateTime: null,
    invoiceNumber: 'INV-42',
    manuallyPaid: false,
    technician: { name: 'Kari' },
    vehicle: { id: 'veh_1', year: 2018, make: 'Volvo', model: 'V60', licensePlate: 'AB12345' },
    partItems: [{ name: 'Pad set', quantity: 1, unitPrice: 900, total: 900 }],
    laborItems: [{ description: 'Replace pads', hours: 1.5, total: 1600 }],
    payments: [{ amount: 1000, date: new Date('2026-05-03T10:00:00Z'), method: 'card' }],
    ...overrides,
  }
}

function vehicleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh_1',
    make: 'Volvo',
    model: 'V60',
    year: 2018,
    vin: 'YV1ABC',
    licensePlate: 'AB12345',
    color: 'blue',
    mileage: 121000,
    fuelType: 'diesel',
    transmission: 'automatic',
    engineSize: '2.0',
    engineCode: null,
    purchaseDate: null,
    purchasePrice: 250000,
    isArchived: false,
    archiveReason: null,
    customer: { id: 'cus_1', name: 'Ola Nordmann', company: null, phone: '999', email: null },
    serviceRecords: [job()],
    findings: [],
    reminders: [],
    notes: [],
    inspections: [],
    quotes: [],
    fuelLogs: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  serviceRecord.findMany.mockResolvedValue([])
})

describe('ask AI context', () => {
  it('loads the vehicle by id and organization only', async () => {
    vehicle.findFirst.mockResolvedValue(vehicleRow())
    const ctx = await buildAskAiContext(ORG, { type: 'vehicle', id: 'veh_1' }, options)
    expect(vehicle.findFirst).toHaveBeenCalledTimes(1)
    expect(vehicle.findFirst.mock.calls[0][0].where).toEqual({ id: 'veh_1', organizationId: ORG })
    expect(ctx?.title).toBe('2018 Volvo V60')
    expect(ctx?.text).toContain('Brake pads')
    expect(ctx?.text).toContain('Ola Nordmann')
    expect(ctx?.text).toContain('/vehicles/veh_1/service/job_1')
  })

  it('returns null for a vehicle another workshop owns', async () => {
    vehicle.findFirst.mockResolvedValue(null)
    expect(await buildAskAiContext(ORG, { type: 'vehicle', id: 'veh_x' }, options)).toBeNull()
  })

  it('includes amounts and payment state when money may be shown', async () => {
    vehicle.findFirst.mockResolvedValue(vehicleRow())
    const ctx = await buildAskAiContext(ORG, { type: 'vehicle', id: 'veh_1' }, options)
    expect(ctx?.text).toContain('2500.00 NOK')
    expect(ctx?.text).toContain('partly paid')
    expect(ctx?.text).toContain('payments: 1000.00 NOK')
    expect(ctx?.text).toContain('purchase price: 250000.00 NOK')
  })

  it('leaves every amount out for a user who may not see money', async () => {
    vehicle.findFirst.mockResolvedValue(vehicleRow())
    const ctx = await buildAskAiContext(
      ORG,
      { type: 'vehicle', id: 'veh_1' },
      { ...options, showMoney: false }
    )
    expect(ctx?.text).not.toContain('NOK')
    expect(ctx?.text).not.toContain('2500')
    expect(ctx?.text).not.toContain('250000')
    expect(ctx?.text).not.toContain('payment')
    expect(ctx?.text).not.toContain('paid')
    // The parts and labour themselves still show, only the prices go.
    expect(ctx?.text).toContain('Pad set x1')
    expect(ctx?.text).toContain('Replace pads 1.5h')
  })

  it('stops at the character budget and says so', async () => {
    const many = Array.from({ length: 175 }, (_, i) =>
      job({ id: `job_${i}`, title: `Job ${i} ${'x'.repeat(400)}`, description: 'y'.repeat(400) })
    )
    vehicle.findFirst.mockResolvedValue(vehicleRow({ serviceRecords: many }))
    const ctx = await buildAskAiContext(ORG, { type: 'vehicle', id: 'veh_1' }, options)
    expect(ctx?.truncated).toBe(true)
    expect(ctx?.text.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 100)
    expect(ctx?.text).toContain('left out for length')
  })

  it('loads a customer with the jobs on their vehicles and counter sales', async () => {
    customer.findFirst.mockResolvedValue({
      id: 'cus_1',
      customerNumber: '17',
      name: 'Ola Nordmann',
      company: 'Nordmann AS',
      email: 'ola@example.com',
      phone: null,
      address: null,
      taxExempt: false,
      reminderOptOut: true,
      notes: 'Prefers SMS',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      vehicles: [
        {
          id: 'veh_1',
          year: 2018,
          make: 'Volvo',
          model: 'V60',
          licensePlate: 'AB12345',
          mileage: 121000,
          isArchived: false,
          _count: { serviceRecords: 3 },
        },
      ],
      quotes: [],
      reminders: [],
      smsMessages: [
        {
          direction: 'inbound',
          body: 'Is the car ready?',
          createdAt: new Date('2026-05-03T09:00:00Z'),
        },
      ],
      telegramMessages: [],
      whatsappMessages: [],
    })
    serviceRecord.findMany.mockResolvedValue([
      job(),
      job({ id: 'job_2', title: 'Wipers', vehicle: null }),
    ])

    const ctx = await buildAskAiContext(ORG, { type: 'customer', id: 'cus_1' }, options)
    expect(customer.findFirst.mock.calls[0][0].where).toEqual({ id: 'cus_1', organizationId: ORG })
    expect(serviceRecord.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      OR: [{ customerId: 'cus_1' }, { vehicle: { customerId: 'cus_1' } }],
    })
    expect(ctx?.title).toBe('Ola Nordmann')
    expect(ctx?.text).toContain('opted out of reminders and campaigns: yes')
    expect(ctx?.text).toContain('2018 Volvo V60')
    expect(ctx?.text).toContain('no vehicle (counter sale)')
    expect(ctx?.text).toContain('SMS from customer: Is the car ready?')
  })

  it('tells the model when money was hidden or records were cut', () => {
    const base = {
      workshopName: 'Test Garage',
      subject: { type: 'vehicle' as const, id: 'veh_1' },
      today: '2026-09-16',
      languageName: 'Norwegian',
    }
    const hidden = askAiSystemPrompt({
      ...base,
      options: { ...options, showMoney: false },
      context: { title: 'V60', text: 'RECORD', truncated: true },
    })
    expect(hidden).toContain('not allowed to see them')
    expect(hidden).toContain('oldest entries were left out')
    expect(hidden).toContain('Always answer in Norwegian')

    const shown = askAiSystemPrompt({
      ...base,
      languageName: null,
      options,
      context: { title: 'V60', text: 'RECORD', truncated: false },
    })
    expect(shown).toContain('Amounts are in NOK')
    expect(shown).not.toContain('left out')
    expect(shown).toContain('language the question is written in')
  })
})
