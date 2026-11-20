/**
 * The portal's invoice list and vehicle page, as a customer reads them.
 *
 * Dates are the workshop's calendar day in the portal's language (a Norwegian
 * customer used to read 11/9/2026); an unpaid bill is the loudest thing on the
 * list and says what is owed and by when; a vehicle's distance follows the
 * workshop's units and a boat is spoken of as a boat; a job still in the
 * workshop has no price or download, since its PDF does not exist yet.
 */

import fs from 'node:fs'
import path from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nb',
  getTranslations: async (namespace: string) => {
    const [file, ...rest] = namespace.split('.')
    let messages: unknown = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), `messages/en/${file}.json`), 'utf-8')
    )
    for (const seg of rest) messages = (messages as Record<string, unknown>)[seg]
    return (key: string, values?: Record<string, unknown>) => {
      let tpl: unknown = messages
      for (const seg of key.split('.')) tpl = (tpl as Record<string, unknown> | undefined)?.[seg]
      if (typeof tpl !== 'string') return key
      return String(new IntlMessageFormat(tpl, 'en').format(values as never))
    }
  },
}))
vi.mock('@/features/portal/Components/PortalShell', () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/features/portal/Components/PortalDocumentsTabs', () => ({
  PortalDocumentsTabs: ({ active }: { active: string }) => <nav data-tabs={active} />,
}))
vi.mock('@/features/portal/Components/ReportSoldButton', () => ({ ReportSoldButton: () => null }))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: vi.fn(async () => ({ id: 'org-real', name: 'Verksted' })),
}))
vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: { findMany: vi.fn() },
    appSetting: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
  },
}))
vi.mock('@/features/portal/Actions/portalActions', () => ({
  getPortalInvoices: vi.fn(),
  getPortalVehicleDetail: vi.fn(),
  getPortalVehicleTires: vi.fn(),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({}))
// The workshop's formatter, in Oslo and in Norwegian, as portalFormat builds it.
vi.mock('@/features/portal/Lib/portalFormat', async () => {
  const actual = await vi.importActual<typeof import('@/features/portal/Lib/portalFormat')>(
    '@/features/portal/Lib/portalFormat'
  )
  return {
    portalFormat: async () =>
      actual.buildPortalFormat({
        locale: 'nb',
        timeZone: 'Europe/Oslo',
        timeFormat: '24h',
        money: (n) => `kr ${n.toFixed(2)}`,
        today: 'i dag',
        tomorrow: 'i morgen',
        now: new Date('2026-11-15T12:00:00Z'),
      }),
  }
})

import { db } from '@/lib/db'
import {
  getPortalInvoices,
  getPortalVehicleDetail,
  getPortalVehicleTires,
} from '@/features/portal/Actions/portalActions'
import PortalInvoicesPage from '@/app/(public)/portal/[orgId]/invoices/(list)/page'
import PortalVehicleDetailPage from '@/app/(public)/portal/[orgId]/vehicles/[vehicleId]/page'

const invoice = (over: Record<string, unknown>) => ({
  id: 'inv',
  title: 'Brake service',
  invoiceNumber: '1001',
  status: 'completed',
  totalAmount: 1000,
  // 23:30 in Oslo on 8 November: still the 8th there, the 8th in UTC too.
  serviceDate: new Date('2026-11-08T22:30:00Z'),
  startDateTime: null,
  invoiceDate: null,
  invoiceDueDate: null,
  publicToken: null,
  manuallyPaid: false,
  vehicle: { make: 'Volvo', model: 'V60' },
  payments: [],
  ...over,
})

/**
 * The app's own colour classes. They follow the app's light or dark mode and
 * its amber, not the portal theme: dark grey text on the Garage theme's black.
 * A portal page takes its colours from the theme's variables instead.
 */
const APP_COLOUR =
  /\b(?:text|bg|border)-(?:muted-foreground|foreground|primary|destructive|card|muted|background|border|accent|secondary)\b/

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPortalVehicleTires).mockResolvedValue({ success: true, data: [] } as never)
})

describe('the invoice list', () => {
  beforeEach(() => {
    vi.mocked(getPortalInvoices).mockResolvedValue({
      success: true,
      data: [
        invoice({
          id: 'a',
          invoiceNumber: '1001',
          invoiceDueDate: new Date('2026-11-22T11:00:00Z'),
        }),
        invoice({ id: 'b', invoiceNumber: '1002', payments: [{ amount: 400 }] }),
        invoice({
          id: 'c',
          invoiceNumber: '1003',
          payments: [{ amount: 1000 }],
          invoiceDueDate: new Date('2026-11-01T11:00:00Z'),
        }),
      ],
    } as never)
  })

  async function renderList() {
    render(await PortalInvoicesPage({ params: Promise.resolve({ orgId: 'verksted' }) }))
    // The phone cards; the table repeats the same rows for wider screens.
    return screen.getAllByRole('list')[0]
  }

  it('prints the date as the workshop day in the portal language', async () => {
    const cards = await renderList()
    expect(within(cards).getAllByText('8. nov.')).toHaveLength(3)
    expect(screen.queryByText('11/8/2026')).not.toBeInTheDocument()
  })

  it('draws payment as a status, never in the colour of a button', async () => {
    const cards = await renderList()
    const badge = (state: string) => cards.querySelector(`[data-payment="${state}"]`) as HTMLElement
    expect(badge('unpaid')).toHaveTextContent('Unpaid')
    expect(badge('paid')).toHaveTextContent('Paid')
    // The workshop's colour is what actions wear: no status is filled with it.
    for (const state of ['unpaid', 'partial', 'paid']) {
      expect(badge(state)).toHaveClass('p-badge')
      expect(badge(state).className).not.toMatch(/accent/)
    }
  })

  it('calls a partly paid invoice partly paid, never unpaid, and says what is left', async () => {
    const cards = await renderList()
    const partly = within(cards).getAllByRole('listitem')[1]
    expect(within(partly).getByText('Partly paid')).toHaveClass('p-badge--outline')
    expect(within(partly).queryByText('Unpaid')).not.toBeInTheDocument()
    expect(within(partly).queryByText(/not paid/i)).not.toBeInTheDocument()
    expect(within(partly).getByText('kr 600.00 left to pay')).toBeInTheDocument()
  })

  it('sums up beside the list what is left to pay and which invoice comes first', async () => {
    await renderList()
    const summary = screen.getByRole('region', { name: 'Left to pay' })
    // 1000 unpaid and 600 left on the partly paid one.
    expect(within(summary).getByText('kr 1600.00')).toBeInTheDocument()
    expect(within(summary).getByText(/on 2 invoices/)).toBeInTheDocument()
    expect(within(summary).getByText(/Next due 22\. nov\./)).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: 'Open Invoice 1001' })).toHaveAttribute(
      'href',
      '/portal/verksted/invoices/a'
    )
  })

  it('says there is nothing to pay when every invoice is paid', async () => {
    vi.mocked(getPortalInvoices).mockResolvedValue({
      success: true,
      data: [invoice({ id: 'c', payments: [{ amount: 1000 }] })],
    } as never)
    await renderList()
    expect(screen.getByRole('region', { name: 'Nothing to pay' })).toBeInTheDocument()
  })

  it('draws both the cards and the table from the theme, so a dark theme reads', async () => {
    const { container } = render(
      await PortalInvoicesPage({ params: Promise.resolve({ orgId: 'verksted' }) })
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(APP_COLOUR)
  })

  it('says what is left to pay and when it is due, but not on a paid one', async () => {
    const cards = await renderList()
    expect(within(cards).getByText('Due 22. nov.')).toBeInTheDocument()
    expect(within(cards).getByText('kr 600.00 left to pay')).toBeInTheDocument()
    expect(within(cards).queryByText('Due 1. nov.')).not.toBeInTheDocument()
  })

  it('says an unpaid bill is overdue once its due day has passed at the workshop', async () => {
    vi.mocked(getPortalInvoices).mockResolvedValue({
      success: true,
      data: [
        // Due the 14th; the workshop's today is the 15th.
        invoice({ id: 'late', invoiceDueDate: new Date('2026-11-14T11:00:00Z') }),
        // Due today: still in time.
        invoice({
          id: 'today',
          invoiceNumber: '1002',
          invoiceDueDate: new Date('2026-11-15T20:00:00Z'),
        }),
      ],
    } as never)
    const cards = await renderList()
    // Overdue is a status of its own, in the theme's warning colour.
    const lateCard = within(cards).getAllByRole('listitem')[0]
    expect(lateCard.querySelector('[data-payment="overdue"]')).toHaveTextContent('Overdue')
    expect(lateCard.querySelector('[data-payment="overdue"]')).toHaveClass('p-badge--danger')
    const late = within(cards).getByText('Overdue since 14. nov.')
    // The theme's own warning colour, which every theme defines.
    expect(late).toHaveClass('text-[color:var(--p-danger)]')
    expect(within(cards).queryByText('Due 14. nov.')).not.toBeInTheDocument()
    expect(within(cards).getByText('Due 15. nov.')).toBeInTheDocument()
  })

  it('opens the invoice from the whole card and keeps the download its own link', async () => {
    const cards = await renderList()
    const first = within(cards).getAllByRole('listitem')[0]
    expect(within(first).getByRole('link', { name: 'Invoice 1001' })).toHaveAttribute(
      'href',
      '/portal/verksted/invoices/a'
    )
    expect(within(first).getByRole('link', { name: /Download PDF/ })).toHaveAttribute(
      'href',
      '/portal/verksted/invoices/a/pdf'
    )
    expect(screen.getAllByRole('navigation')[0]).toHaveAttribute('data-tabs', 'invoices')
  })

  it('takes the due dates from the list itself, with no second lookup', async () => {
    await renderList()
    expect(db.serviceRecord.findMany).not.toHaveBeenCalled()
  })
})

describe('the vehicle page', () => {
  const vehicle = {
    id: 'v1',
    soldReportedAt: null,
    make: 'Volvo',
    model: 'V60',
    year: 2019,
    vin: 'YV1ZW25UDK1234567',
    licensePlate: 'EK 12345',
    hsn: null,
    tsn: null,
    color: null,
    mileage: 123456,
    fuelType: null,
    transmission: null,
    serviceRecords: [
      {
        id: 'done',
        title: 'Yearly service',
        invoiceNumber: '1001',
        status: 'completed',
        totalAmount: 2500,
        serviceDate: new Date('2026-11-08T10:00:00Z'),
        startDateTime: null,
        publicToken: null,
        mileage: 120000,
        warrantyMonths: null,
        warrantyMileage: null,
        warrantyExpiresAt: null,
        warrantyNotes: null,
      },
      {
        id: 'open',
        title: 'Brake pads',
        invoiceNumber: null,
        status: 'in-progress',
        totalAmount: 900,
        serviceDate: new Date('2026-11-14T10:00:00Z'),
        startDateTime: null,
        publicToken: null,
        mileage: 123456,
        warrantyMonths: null,
        warrantyMileage: null,
        warrantyExpiresAt: null,
        warrantyNotes: null,
      },
    ],
    inspections: [],
  }

  function settings(serviceType: string, unitSystem: string) {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'workshop.serviceType', value: serviceType },
      { key: 'workshop.unitSystem', value: unitSystem },
    ] as never)
  }

  beforeEach(() => {
    vi.mocked(getPortalVehicleDetail).mockResolvedValue({ success: true, data: vehicle } as never)
  })

  const renderPage = async () =>
    render(
      await PortalVehicleDetailPage({
        params: Promise.resolve({ orgId: 'verksted', vehicleId: 'v1' }),
      })
    )

  it('names the warranty on a finished job, so the badge is not a bare "Active"', async () => {
    settings('automotive', 'metric')
    const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    vi.mocked(getPortalVehicleDetail).mockResolvedValue({
      success: true,
      data: {
        ...vehicle,
        serviceRecords: [{ ...vehicle.serviceRecords[0], warrantyExpiresAt: inAYear }],
      },
    } as never)
    await renderPage()
    expect(screen.getByText('Warranty active')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('prints the distance in the workshop units, in the portal language', async () => {
    settings('automotive', 'metric')
    await renderPage()
    expect(screen.getByText(/^123\s456 km$/)).toBeInTheDocument()
    expect(screen.queryByText(/ mi$/)).not.toBeInTheDocument()
  })

  it('reads the settings of the workshop the address resolved to, not the address', async () => {
    settings('automotive', 'imperial')
    await renderPage()
    expect(db.appSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
    )
    expect(screen.getByText(/^123\s456 mi$/)).toBeInTheDocument()
  })

  it('speaks of a boat as a boat', async () => {
    settings('marine', 'metric')
    await renderPage()
    expect(screen.getByText('Registration: EK 12345')).toBeInTheDocument()
    expect(screen.getByText('HIN: YV1ZW25UDK1234567')).toBeInTheDocument()
    expect(screen.getByText(/^123\s456 engine hours$/)).toBeInTheDocument()
  })

  it('shows a price and a download only for finished work', async () => {
    settings('automotive', 'metric')
    await renderPage()
    const rows = screen.getAllByRole('listitem')
    const done = rows.find((r) => r.textContent?.includes('Yearly service')) as HTMLElement
    const open = rows.find((r) => r.textContent?.includes('Brake pads')) as HTMLElement
    expect(within(done).getByText('kr 2500.00')).toBeInTheDocument()
    expect(within(done).getByRole('link', { name: /Download/ })).toHaveAttribute(
      'href',
      '/portal/verksted/invoices/done/pdf'
    )
    expect(within(open).getByText('In progress')).toBeInTheDocument()
    expect(within(open).queryByText('kr 900.00')).not.toBeInTheDocument()
    expect(within(open).queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers no invoice for a finished job held for the customer reference / PO', async () => {
    settings('automotive', 'metric')
    vi.mocked(getPortalVehicleDetail).mockResolvedValue({
      success: true,
      data: {
        ...vehicle,
        serviceRecords: [{ ...vehicle.serviceRecords[0], invoiceHeld: true }],
      },
    } as never)
    await renderPage()
    const held = screen
      .getAllByRole('listitem')
      .find((r) => r.textContent?.includes('Yearly service')) as HTMLElement
    expect(within(held).getByText('Completed')).toBeInTheDocument()
    expect(within(held).queryByText(/1001/)).not.toBeInTheDocument()
    expect(within(held).queryByText('kr 2500.00')).not.toBeInTheDocument()
    expect(within(held).queryByRole('link')).not.toBeInTheDocument()
  })

  it('lists the tyres the workshop stores for this car, when it shows tyres', async () => {
    settings('automotive', 'metric')
    vi.mocked(getPortalVehicleTires).mockResolvedValue({
      success: true,
      data: [
        {
          id: 't1',
          season: 'winter',
          studded: true,
          brand: 'Nokian',
          model: 'Hakkapeliitta 10',
          size: '225/60 R18',
          quantity: 4,
          withRims: true,
          storedSince: '2026-10-20T08:00:00.000Z',
        },
      ],
    } as never)
    await renderPage()
    const tires = screen.getByRole('region', { name: 'Tyre hotel' })
    expect(within(tires).getByText('Winter tyres stored with us')).toBeInTheDocument()
    expect(
      within(tires).getByText(
        'Nokian Hakkapeliitta 10 · 225/60 R18 · 4 tyres · studded · on rims · stored since 20. okt.'
      )
    ).toBeInTheDocument()
  })

  it('has no tyre block for a car with none stored', async () => {
    settings('automotive', 'metric')
    await renderPage()
    expect(screen.queryByRole('region', { name: 'Tyre hotel' })).not.toBeInTheDocument()
  })

  it('offers to book a visit for this car and takes its colours from the theme', async () => {
    settings('automotive', 'metric')
    const { container } = await renderPage()
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/verksted/request-service?vehicle=v1'
    )
    expect(container.innerHTML).not.toMatch(APP_COLOUR)
  })

  it('treats an archived vehicle as gone, as the list does', async () => {
    settings('automotive', 'metric')
    // The action looks among vehicles that are not archived, and finds none.
    vi.mocked(getPortalVehicleDetail).mockResolvedValue({
      success: false,
      error: 'Vehicle not found',
    })
    await renderPage()
    expect(screen.getByText('We could not find this vehicle.')).toBeInTheDocument()
    expect(screen.queryByText('Yearly service')).not.toBeInTheDocument()
  })
})
