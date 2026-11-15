/**
 * What the portal home holds: one shape, built from the rows, that every
 * theme draws. The workshop here is in Auckland, half a day ahead of UTC, so
 * "today" on the server's clock is the wrong day for most of these.
 */

import { describe, expect, it } from 'vitest'
import {
  type HomeInvoiceRow,
  type HomeJobRow,
  type HomeQuoteRow,
  type HomeTireSetRow,
  type PortalHomeInput,
  buildPortalHome,
  firstNameOf,
  portalJobStage,
  workshopHoursLine,
  workshopHoursNow,
} from '@/features/portal/Lib/homeData'
import type { PortalWorkshop } from '@/features/portal/Lib/homeTypes'

const timeZone = 'Pacific/Auckland'
// 20 Nov 2026, 10:30 in Auckland (UTC+13), which is still 19 Nov in UTC.
const now = new Date('2026-11-19T21:30:00Z')
const volvo = { id: 'v1', make: 'Volvo', model: 'V60', licensePlate: 'AB12345' }

const job = (over: Partial<HomeJobRow>): HomeJobRow => ({
  id: 'j1',
  title: 'Service',
  status: 'pending',
  startDateTime: null,
  promisedAt: null,
  createdAt: new Date('2026-11-10T00:00:00Z'),
  vehicle: volvo,
  statusReports: [],
  ...over,
})

const invoice = (over: Partial<HomeInvoiceRow>): HomeInvoiceRow => ({
  id: 'i1',
  title: 'Brake pads',
  invoiceNumber: 'INV-1',
  totalAmount: 1000,
  manuallyPaid: false,
  serviceDate: new Date('2026-11-12T00:00:00Z'),
  invoiceDate: null,
  invoiceDueDate: null,
  publicToken: null,
  vehicle: volvo,
  payments: [],
  ...over,
})

const quote = (over: Partial<HomeQuoteRow>): HomeQuoteRow => ({
  id: 'q1',
  title: 'Timing belt',
  quoteNumber: 'Q-1',
  status: 'sent',
  totalAmount: 5000,
  validUntil: null,
  vehicle: volvo,
  ...over,
})

const workshopInfo: PortalWorkshop = {
  name: 'Egeland Auto',
  logoUrl: null,
  phone: null,
  phoneHref: null,
  email: null,
  address: null,
  directionsUrl: null,
  openToday: [],
  openNow: false,
  opensAt: null,
  closesAt: null,
  openLine: 'Closed today',
  hours: null,
}

const tireSet = (over: Partial<HomeTireSetRow>): HomeTireSetRow => ({
  id: 't1',
  season: 'summer',
  studded: false,
  brand: 'Michelin',
  model: 'Primacy 4',
  size: '225/60 R18',
  quantity: 4,
  withRims: false,
  checkedInAt: new Date('2026-10-21T08:00:00Z'),
  createdAt: new Date('2026-10-20T08:00:00Z'),
  vehicle: volvo,
  measurements: [],
  ...over,
})

const home = (over: Partial<PortalHomeInput> = {}) =>
  buildPortalHome({
    orgParam: 'egeland',
    timeZone,
    now,
    customerName: 'Kari Nordmann',
    workshop: workshopInfo,
    marine: false,
    onlinePayment: false,
    jobs: [],
    invoices: [],
    quotes: [],
    requests: [],
    appointments: [],
    cars: [],
    warranties: [],
    tires: null,
    messages: { enabled: true, unread: 0, latest: [] },
    ...over,
  })

describe('who the home greets', () => {
  it('uses the first name', () => {
    expect(home().customerFirstName).toBe('Kari')
    expect(firstNameOf('Cher')).toBe('Cher')
    expect(firstNameOf('  Ola  Nordmann ')).toBe('Ola')
  })

  it('drops the full stop of an initial, so a greeting does not end in two', () => {
    expect(firstNameOf('K. Nordmann')).toBe('K')
    expect(home({ customerName: 'K. Nordmann' }).customerFirstName).toBe('K')
    expect(firstNameOf('...')).toBe('...')
  })
})

describe('where a job is', () => {
  it('is booked until work starts, and in the workshop from then on', () => {
    expect(portalJobStage('pending')).toBe('booked')
    expect(portalJobStage('scheduled')).toBe('booked')
    expect(portalJobStage('in-progress')).toBe('working')
    expect(portalJobStage('waiting-parts')).toBe('working')
  })

  it('puts work under way first, then what is booked by when the car comes in', () => {
    const data = home({
      jobs: [
        job({ id: 'later', status: 'scheduled', startDateTime: new Date('2026-12-03T07:00:00Z') }),
        job({ id: 'undated', status: 'pending' }),
        job({ id: 'sooner', status: 'scheduled', startDateTime: new Date('2026-11-25T07:00:00Z') }),
        job({ id: 'parts', status: 'waiting-parts' }),
        job({
          id: 'promised',
          status: 'in-progress',
          promisedAt: new Date('2026-11-20T02:00:00Z'),
        }),
      ],
    })
    expect(data.jobs.map((j) => j.id)).toEqual(['promised', 'parts', 'sooner', 'later', 'undated'])
    expect(data.jobs.map((j) => j.stage)).toEqual([
      'working',
      'working',
      'booked',
      'booked',
      'booked',
    ])
  })

  it('names the car as the customer does and carries the promised time', () => {
    const [only] = home({
      jobs: [job({ status: 'in-progress', promisedAt: new Date('2026-11-20T02:00:00Z') })],
    }).jobs
    expect(only.vehicle).toEqual({ id: 'v1', label: 'Volvo V60', licensePlate: 'AB12345' })
    expect(only.promisedAt).toBe('2026-11-20T02:00:00.000Z')
  })

  it('carries the newest update the workshop shared, with its words, and none that has expired', () => {
    const report = (id: string, sentAt: string, expiresAt: Date | null = null) => ({
      id,
      publicToken: `tok-${id}`,
      message: id === 'new' ? ' Front discs are worn. ' : null,
      sentAt: new Date(sentAt),
      viewedAt: null,
      createdAt: new Date(sentAt),
      expiresAt,
    })
    const data = home({
      jobs: [
        job({
          id: 'a',
          status: 'in-progress',
          statusReports: [
            report('old', '2026-11-17T00:00:00Z'),
            report('new', '2026-11-18T00:00:00Z'),
            report('gone', '2026-11-19T00:00:00Z', new Date('2026-11-19T12:00:00Z')),
          ],
        }),
        job({ id: 'b', status: 'pending' }),
      ],
    })
    expect(data.jobs.find((j) => j.id === 'a')?.update).toEqual({
      at: '2026-11-18T00:00:00.000Z',
      url: '/share/status-report/egeland/tok-new',
      message: 'Front discs are worn.',
    })
    expect(data.jobs.find((j) => j.id === 'b')?.update).toBeNull()
  })
})

describe('what there is to pay', () => {
  it('leaves out an invoice that is paid, in full or by hand', () => {
    const data = home({
      invoices: [
        invoice({
          id: 'open',
          payments: [{ amount: 400 }],
        }),
        invoice({
          id: 'paid',
          payments: [{ amount: 1000 }],
        }),
        invoice({ id: 'cash', manuallyPaid: true }),
      ],
    })
    expect(data.toPay.map((i) => i.id)).toEqual(['open'])
    expect(data.toPay[0]).toMatchObject({ total: 1000, paid: 400, balance: 600 })
    expect(data.toPayTotal).toBe(600)
  })

  it('judges overdue on the workshop day, not the server day', () => {
    // Due 19 Nov in Auckland. In UTC it is still the 19th; in Auckland the 20th.
    const dueYesterday = new Date('2026-11-18T11:00:00Z')
    // Due 20 Nov in Auckland, which is today there and "tomorrow" in UTC terms.
    const dueToday = new Date('2026-11-19T11:00:00Z')
    const data = home({
      invoices: [
        invoice({ id: 'today', invoiceDueDate: dueToday }),
        invoice({ id: 'yesterday', invoiceDueDate: dueYesterday }),
      ],
    })
    expect(data.toPay.find((i) => i.id === 'yesterday')?.overdue).toBe(true)
    expect(data.toPay.find((i) => i.id === 'today')?.overdue).toBe(false)
  })

  it('puts overdue first, then the soonest due, then those with no due day', () => {
    const data = home({
      invoices: [
        invoice({ id: 'nodue' }),
        invoice({ id: 'later', invoiceDueDate: new Date('2026-12-10T11:00:00Z') }),
        invoice({ id: 'soon', invoiceDueDate: new Date('2026-11-25T11:00:00Z') }),
        invoice({ id: 'late', invoiceDueDate: new Date('2026-11-01T11:00:00Z') }),
      ],
    })
    expect(data.toPay.map((i) => i.id)).toEqual(['late', 'soon', 'later', 'nodue'])
    expect(data.toPayTotal).toBe(4000)
    // What a home leads with when there are several: the sum, how many, how many overdue.
    expect(data.toPayCount).toBe(4)
    expect(data.toPayOverdueCount).toBe(1)
    expect(home().toPayCount).toBe(0)
  })

  it('always opens the invoice in the portal, and offers paying only where it can be paid', () => {
    const invoices = [
      invoice({ id: 'shared', publicToken: 'tok1' }),
      invoice({ id: 'unshared', publicToken: null }),
    ]
    const withPayments = home({ invoices, onlinePayment: true })
    const shared = withPayments.toPay.find((i) => i.id === 'shared')
    expect(shared?.viewUrl).toBe('/portal/egeland/invoices/shared')
    expect(shared?.payUrl).toBe('/share/invoice/egeland/tok1')
    expect(withPayments.toPay.find((i) => i.id === 'unshared')?.payUrl).toBeNull()

    const without = home({ invoices, onlinePayment: false })
    expect(without.toPay.map((i) => i.payUrl)).toEqual([null, null])
  })
})

describe('what waits for an answer', () => {
  it('is a sent quote, not one already answered', () => {
    const data = home({
      quotes: [
        quote({ id: 'open' }),
        quote({ id: 'yes', status: 'accepted' }),
        quote({ id: 'no', status: 'rejected' }),
      ],
    })
    expect(data.toAnswer.map((q) => q.id)).toEqual(['open'])
  })

  it('drops a quote the day after it ran out on the workshop calendar, not before', () => {
    const data = home({
      quotes: [
        // Valid until 20 Nov in Auckland: today there, so still open.
        quote({ id: 'lastDay', validUntil: new Date('2026-11-19T11:00:00Z') }),
        // Valid until 19 Nov in Auckland: yesterday there, though today in UTC.
        quote({ id: 'expired', validUntil: new Date('2026-11-18T11:00:00Z') }),
        quote({ id: 'open', validUntil: null }),
        quote({ id: 'nextWeek', validUntil: new Date('2026-11-27T11:00:00Z') }),
      ],
    })
    expect(data.toAnswer.map((q) => q.id)).toEqual(['lastDay', 'nextWeek', 'open'])
  })

  it('is read and answered inside the portal', () => {
    const data = home({ quotes: [quote({ id: 'plain' })] })
    expect(data.toAnswer[0].url).toBe('/portal/egeland/quotes/plain')
  })
})

describe('the next visit', () => {
  const booked = (id: string, start: string) =>
    job({ id, status: 'scheduled', startDateTime: new Date(start) })

  it('is the soonest booked job after the one the home already leads with', () => {
    const data = home({
      jobs: [booked('first', '2026-11-25T07:00:00Z'), booked('second', '2026-12-03T07:00:00Z')],
    })
    // The first booking is the headline; the visit card must not repeat it.
    expect(data.jobs[0].id).toBe('first')
    expect(data.nextVisit).toMatchObject({ id: 'second', kind: 'job', title: 'Service' })
  })

  it('is the booking, while another car is in the workshop', () => {
    const data = home({
      jobs: [job({ id: 'now', status: 'in-progress' }), booked('later', '2026-12-03T07:00:00Z')],
    })
    expect(data.nextVisit?.id).toBe('later')
  })

  it('is an appointment the workshop made, when that comes first', () => {
    const data = home({
      jobs: [job({ id: 'now', status: 'in-progress' }), booked('later', '2026-12-03T07:00:00Z')],
      appointments: [
        {
          id: 'a1',
          title: 'Collect winter tyres',
          startAt: new Date('2026-11-24T20:00:00Z'),
          vehicle: null,
        },
      ],
    })
    expect(data.nextVisit).toEqual({
      id: 'a1',
      kind: 'appointment',
      title: 'Collect winter tyres',
      startAt: '2026-11-24T20:00:00.000Z',
      vehicle: null,
    })
  })

  it('counts a visit earlier today on the workshop calendar, and none from yesterday', () => {
    // 08:00 on 20 Nov in Auckland: this morning there, yesterday evening in UTC.
    const thisMorning = home({
      jobs: [job({ id: 'now', status: 'in-progress' }), booked('today', '2026-11-19T19:00:00Z')],
    })
    expect(thisMorning.nextVisit?.id).toBe('today')
    const yesterday = home({
      jobs: [job({ id: 'now', status: 'in-progress' }), booked('gone', '2026-11-18T19:00:00Z')],
    })
    expect(yesterday.nextVisit).toBeNull()
  })

  it('is nothing when nothing is booked', () => {
    expect(home().nextVisit).toBeNull()
  })
})

describe("the customer's cars", () => {
  const car = (id: string, make: string, model: string, visits = 0) => ({
    id,
    make,
    model,
    year: 2019,
    licensePlate: `${id.toUpperCase()} 12345`,
    mileage: 80_000,
    visits,
  })

  it('lists the one in the workshop first, then by name, with how often each has been in', () => {
    const data = home({
      cars: [
        car('t', 'Toyota', 'RAV4', 3),
        car('a', 'Audi', 'A4', 1),
        car('v1', 'Volvo', 'V60', 8),
      ],
      jobs: [job({ status: 'in-progress' })],
    })
    expect(data.cars.map((c) => [c.label, c.visits, c.inWorkshop])).toEqual([
      ['Volvo V60', 8, true],
      ['Audi A4', 1, false],
      ['Toyota RAV4', 3, false],
    ])
    expect(data.cars[0].url).toBe('/portal/egeland/vehicles/v1')
  })

  it('does not call a car that is only booked "in the workshop"', () => {
    const data = home({ cars: [car('v1', 'Volvo', 'V60')], jobs: [job({ status: 'scheduled' })] })
    expect(data.cars[0].inWorkshop).toBe(false)
  })

  it('says when a warranty on the car still runs, and when it ends soon', () => {
    const warranty = (vehicleId: string, expires: string) => ({
      vehicleId,
      warrantyExpiresAt: new Date(expires),
      warrantyMileage: null,
      mileage: null,
    })
    const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString()
    const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const data = home({
      cars: [car('a', 'Audi', 'A4'), car('b', 'BMW', 'i3'), car('c', 'Citroen', 'C3')],
      warranties: [warranty('a', inAYear), warranty('a', inAWeek), warranty('b', inAWeek)],
    })
    expect(data.cars.map((c) => c.warranty)).toEqual(['active', 'expiring', null])
  })
})

describe('tyres stored with the workshop', () => {
  it('are left out altogether when the workshop runs no tyre hotel or hides it', () => {
    expect(home({ tires: null }).tires).toBeNull()
  })

  it('are an empty list when the tyre hotel is on and nothing is stored', () => {
    expect(home({ tires: [] }).tires).toEqual([])
  })

  it('carry the season, the tyre, its size and when the set came in', () => {
    const [set] = home({ tires: [tireSet({})] }).tires ?? []
    expect(set).toMatchObject({
      season: 'summer',
      brand: 'Michelin',
      model: 'Primacy 4',
      size: '225/60 R18',
      quantity: 4,
      storedSince: '2026-10-21T08:00:00.000Z',
      vehicle: { label: 'Volvo V60' },
    })
  })

  it('give the shallowest tread of the latest measuring, not an older or a deeper one', () => {
    const at = (iso: string, mm: number | null, movementId: string | null = null) => ({
      treadDepthMm: mm,
      measuredAt: new Date(iso),
      movementId,
    })
    const [set] =
      home({
        tires: [
          tireSet({
            measurements: [
              at('2026-10-21T08:00:00Z', 5.5, 'in'),
              at('2026-10-21T08:01:00Z', 5, 'in'),
              at('2026-10-21T08:02:00Z', 6, 'in'),
              at('2026-10-21T08:03:00Z', null, 'in'),
              // Last spring's check-in was more worn-in memory, not today's tyres.
              at('2026-04-10T08:00:00Z', 3, 'spring'),
            ],
          }),
        ],
      }).tires ?? []
    expect(set.treadDepthMm).toBe(5)
  })

  it('say nothing about tread the workshop never measured', () => {
    const [set] = home({ tires: [tireSet({})] }).tires ?? []
    expect(set.treadDepthMm).toBeNull()
  })

  it('treat a season the portal does not know as other', () => {
    const [set] = home({ tires: [tireSet({ season: 'track' })] }).tires ?? []
    expect(set.season).toBe('other')
  })
})

describe('the chat', () => {
  it('is passed on as it was read', () => {
    const messages = { enabled: false, unread: 2, latest: [] }
    expect(home({ messages }).messages).toBe(messages)
  })
})

describe("today's hours", () => {
  const workshop = {
    ...workshopInfo,
    openToday: [
      { start: '08:00', end: '11:30' },
      { start: '12:00', end: '16:00' },
    ],
  }

  it('says open until the stretch it is in ends, not the last closing of the day', () => {
    expect(workshopHoursLine({ ...workshop, openNow: true, closesAt: '11:30' })).toEqual({
      key: 'openUntil',
      time: '11:30',
    })
    expect(workshopHoursLine({ ...workshop, openNow: true, closesAt: '16:00' })).toEqual({
      key: 'openUntil',
      time: '16:00',
    })
  })

  // 20 Nov in Auckland (UTC+13): 08:00 there is 19:00 UTC the day before.
  const lunchDay = [
    { start: new Date('2026-11-19T19:00:00Z'), end: new Date('2026-11-19T23:00:00Z') },
    { start: new Date('2026-11-20T00:00:00Z'), end: new Date('2026-11-20T03:00:00Z') },
  ]

  it('is open until 12:00 at ten for a workshop open 08 to 12 and 13 to 16', () => {
    const at10 = workshopHoursNow(lunchDay, new Date('2026-11-19T21:00:00Z'), timeZone)
    expect(at10).toEqual({
      openToday: [
        { start: '08:00', end: '12:00' },
        { start: '13:00', end: '16:00' },
      ],
      openNow: true,
      closesAt: '12:00',
      opensAt: null,
    })
    expect(workshopHoursLine({ ...workshop, ...at10 })).toEqual({ key: 'openUntil', time: '12:00' })
  })

  it('opens again at 13:00 over lunch, and is open until 16:00 after it', () => {
    const lunch = workshopHoursNow(lunchDay, new Date('2026-11-19T23:30:00Z'), timeZone)
    expect(workshopHoursLine({ ...workshop, ...lunch })).toEqual({ key: 'opensAt', time: '13:00' })
    const after = workshopHoursNow(lunchDay, new Date('2026-11-20T01:00:00Z'), timeZone)
    expect(workshopHoursLine({ ...workshop, ...after })).toEqual({
      key: 'openUntil',
      time: '16:00',
    })
  })

  it('says when it opens later today, also after a break', () => {
    expect(workshopHoursLine({ ...workshop, opensAt: '12:00' })).toEqual({
      key: 'opensAt',
      time: '12:00',
    })
  })

  it('tells closed for today apart from not open today', () => {
    expect(workshopHoursLine(workshop)).toEqual({ key: 'closedNow' })
    expect(workshopHoursLine({ ...workshop, openToday: [] })).toEqual({ key: 'closedToday' })
  })
})

describe('boats', () => {
  it('passes on whether the workshop works on boats', () => {
    expect(home().marine).toBe(false)
    expect(home({ marine: true }).marine).toBe(true)
  })
})
