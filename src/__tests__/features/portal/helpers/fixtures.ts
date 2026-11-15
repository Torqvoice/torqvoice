/** A workshop, a formatter and an empty home, for tests that draw the portal. */
import type {
  PortalHomeData,
  PortalHomeFormat,
  PortalWorkshop,
} from '@/features/portal/Lib/homeTypes'
import { buildPortalFormat } from '@/features/portal/Lib/portalFormat'

export const workshop: PortalWorkshop = {
  name: 'Fjordside Auto',
  logoUrl: null,
  phone: '55 00 00 00',
  phoneHref: 'tel:55000000',
  email: null,
  address: 'Strandgaten 14, Bergen',
  directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Strandgaten%2014%2C%20Bergen',
  openToday: [{ start: '07:30', end: '17:00' }],
  openNow: true,
  closesAt: '17:00',
  opensAt: null,
  openLine: 'Open until 17:00',
  hours: null,
}

/** 14 November 2026, 11:00 in Oslo. */
export const now = new Date('2026-11-14T10:00:00Z')

export const format: PortalHomeFormat = buildPortalFormat({
  locale: 'en-GB',
  timeZone: 'Europe/Oslo',
  timeFormat: '24h',
  money: (amount) => `${new Intl.NumberFormat('en-GB').format(amount).replace(/,/g, ' ')} kr`,
  today: 'today',
  tomorrow: 'tomorrow',
  now,
})

export const emptyHome: PortalHomeData = {
  customerName: 'Kari Nordmann',
  customerFirstName: 'Kari',
  marine: false,
  workshop,
  jobs: [],
  nextVisit: null,
  toAnswer: [],
  toPay: [],
  toPayTotal: 0,
  toPayCount: 0,
  toPayOverdueCount: 0,
  cars: [],
  tires: null,
  requests: [],
  messages: { enabled: true, unread: 0, latest: [] },
}

const volvo = { id: 'v60', label: 'Volvo V60', licensePlate: 'EK 12345' }
const toyota = { id: 'rav4', label: 'Toyota RAV4', licensePlate: 'EL 54321' }

/** The home of the mocks: a car in the workshop, a quote, an invoice, tyres, a visit. */
export const fullHome: PortalHomeData = {
  ...emptyHome,
  jobs: [
    {
      id: 'j1',
      title: 'Brake service',
      status: 'in-progress',
      stage: 'working',
      vehicle: volvo,
      startAt: '2026-11-14T07:05:00Z',
      promisedAt: '2026-11-14T15:00:00Z',
      update: {
        at: '2026-11-14T09:12:00Z',
        url: '/share/status-report/fjordside/tok',
        message: 'Front discs are worn past the limit. Photos and a short video are in the update.',
      },
    },
  ],
  nextVisit: {
    id: 'j2',
    kind: 'job',
    title: 'EU inspection follow-up',
    startAt: '2026-12-03T07:00:00Z',
    vehicle: toyota,
  },
  toAnswer: [
    {
      id: 'q1',
      quoteNumber: 'Q-2041',
      title: 'Front discs and pads',
      vehicle: volvo,
      total: 4850,
      validUntil: '2026-11-29T11:00:00Z',
      url: '/portal/fjordside/quotes/q1',
    },
  ],
  toPay: [
    {
      id: 'i1',
      invoiceNumber: '1042',
      title: 'EU inspection and service',
      vehicle: toyota,
      date: '2026-11-09T11:00:00Z',
      total: 4280,
      paid: 0,
      balance: 4280,
      dueAt: '2026-11-28T11:00:00Z',
      overdue: false,
      viewUrl: '/portal/fjordside/invoices/i1',
      payUrl: '/share/invoice/fjordside/tok-i1',
    },
  ],
  toPayTotal: 4280,
  toPayCount: 1,
  toPayOverdueCount: 0,
  cars: [
    {
      ...volvo,
      year: 2019,
      visits: 8,
      inWorkshop: true,
      warranty: null,
      url: '/portal/fjordside/vehicles/v60',
    },
    {
      ...toyota,
      year: 2021,
      visits: 3,
      inWorkshop: false,
      warranty: 'active',
      url: '/portal/fjordside/vehicles/rav4',
    },
  ],
  tires: [
    {
      id: 't1',
      season: 'summer',
      studded: false,
      brand: 'Michelin',
      model: 'Primacy 4',
      size: '225/60 R18',
      quantity: 4,
      withRims: false,
      treadDepthMm: 5,
      storedSince: '2026-10-21T08:00:00Z',
      vehicle: toyota,
    },
  ],
  messages: {
    enabled: true,
    unread: 1,
    latest: [
      {
        id: 'm1',
        direction: 'inbound',
        body: 'Looks bad, go ahead with it. Can I pick up after 16?',
        attachments: [],
        authorName: null,
        createdAt: '2026-11-14T09:30:00Z',
        readAt: '2026-11-14T09:31:00Z',
      },
      {
        id: 'm2',
        direction: 'outbound',
        body: 'You will get a message here when it is ready.',
        attachments: [],
        authorName: 'Jonas',
        createdAt: '2026-11-14T09:34:00Z',
        readAt: null,
      },
    ],
  },
}
