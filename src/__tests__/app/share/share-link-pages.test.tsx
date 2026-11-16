/**
 * What a customer sees on a page opened from a share link.
 *
 * While the link is open and has a date, one line at the foot of the page
 * names the last day it works, on the workshop's calendar. When the address
 * names a real workshop but the token opens nothing, the customer gets a page
 * telling them who to ask, the same page whatever the reason, and never the
 * staff 404.
 */
import { render, screen } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', async () => {
  const { useTranslations } = await import('next-intl')
  return {
    getTranslations: async (arg: string | { namespace: string }) =>
      useTranslations(typeof arg === 'string' ? arg : arg.namespace),
  }
})
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': 'en' }),
  cookies: async () => ({ get: () => undefined }),
}))

class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound()
  },
}))

const organization = { findUnique: vi.fn() }
const appSetting = { findMany: vi.fn() }
const statusReport = { findUnique: vi.fn(), update: vi.fn() }
const serviceRecord = { findUnique: vi.fn() }
const quote = { findFirst: vi.fn() }
const inspection = { findUnique: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: { organization, appSetting, statusReport, serviceRecord, quote, inspection },
}))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: async () => null }))
vi.mock('@/lib/features', () => ({ getFeatures: async () => ({ brandingRemoved: false }) }))
vi.mock('@/features/status-reports/Actions/submitFeedback', () => ({
  submitStatusReportFeedback: vi.fn(),
}))

const { ShareLinkOpenUntil } = await import('@/components/share-link-open-until')
const statusReportPage = await import('@/app/(public)/share/status-report/[orgId]/[token]/page')
const quotePage = await import('@/app/(public)/share/quote/[orgId]/[token]/page')

/** Server components are async functions; run them down to plain elements. */
async function settle(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(settle))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<Record<string, unknown>>
  if (typeof element.type === 'function' && element.type.constructor.name === 'AsyncFunction') {
    return settle(await (element.type as (p: unknown) => Promise<ReactNode>)(element.props))
  }
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(element.props)) {
    props[key] = isValidElement(value) || Array.isArray(value) ? await settle(value) : value
  }
  return cloneElement(element, props)
}

async function show(node: ReactNode) {
  return render(<>{await settle(node)}</>)
}

const WORKSHOP = { id: 'org1', name: 'Nordvik Motor' }

function workshop(settings: Record<string, string> = {}) {
  organization.findUnique.mockImplementation(async ({ where }) =>
    where.id === WORKSHOP.id || where.portalSlug === 'nordvik' ? WORKSHOP : null
  )
  const all: Record<string, string> = {
    'workshop.phone': '+47 22 00 00 00',
    'workshop.email': 'post@nordvik.example',
    ...settings,
  }
  appSetting.findMany.mockImplementation(async ({ where }) =>
    Object.entries(all)
      .filter(([key]) => !where.key?.in || where.key.in.includes(key))
      .map(([key, value]) => ({ key, value }))
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))
  workshop()
  statusReport.findUnique.mockResolvedValue(null)
  quote.findFirst.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the line saying when a link closes', () => {
  const until = (at: string) =>
    ShareLinkOpenUntil({
      organizationId: 'org1',
      expiry: { kind: 'date', at: new Date(at), source: 'workshop' },
    })

  it('names the last day on the workshop’s calendar, not the server’s', async () => {
    // The last instant of 16 December in Los Angeles is already the 17th in UTC.
    workshop({ 'workshop.timezone': 'America/Los_Angeles' })
    await show(await until('2026-12-17T07:59:59.999Z'))
    expect(
      screen.getByText(
        'This link works until Dec 16, 2026. After that, ask Nordvik Motor for a new one.'
      )
    ).toBeInTheDocument()
  })

  it('does the same east of UTC, where the workshop’s day starts first', async () => {
    // The last instant of 17 December in Auckland is still the 16th in UTC.
    workshop({ 'workshop.timezone': 'Pacific/Auckland', 'workshop.dateFormat': 'dd.MM.yyyy' })
    await show(await until('2026-12-17T10:59:59.999Z'))
    expect(screen.getByText(/This link works until 17\.12\.2026\./)).toBeInTheDocument()
  })

  it('promises only the day before when the link closes partway through a day', async () => {
    // A status report lives 14 days to the minute: this one closes at 10:30
    // on 1 December in Oslo, so 30 November is the last day it surely works.
    workshop({ 'workshop.timezone': 'Europe/Oslo' })
    await show(await until('2026-12-01T09:30:00.000Z'))
    expect(screen.getByText(/This link works until Nov 30, 2026\./)).toBeInTheDocument()
  })

  it('is left off the printed page', async () => {
    workshop({ 'workshop.timezone': 'Europe/Oslo' })
    await show(await until('2026-12-16T22:59:59.999Z'))
    expect(screen.getByText(/This link works until/)).toHaveClass('print:hidden')
  })

  it('says nothing for a link that never expires', async () => {
    const line = await ShareLinkOpenUntil({
      organizationId: 'org1',
      expiry: { kind: 'never', source: 'workshop' },
    })
    expect(line).toBeNull()
  })

  it('says nothing on an unpaid invoice that stays open until it is paid', async () => {
    const line = await ShareLinkOpenUntil({
      organizationId: 'org1',
      expiry: { kind: 'untilPaid', source: 'workshop' },
    })
    expect(line).toBeNull()
  })

  it('says nothing once the day has passed, for a portal customer still reading', async () => {
    expect(await until('2026-11-01T22:59:59.999Z')).toBeNull()
  })
})

describe('a status report link', () => {
  const open = (orgId: string, token: string) =>
    statusReportPage.default({ params: Promise.resolve({ orgId, token }) })
  const title = async (orgId: string, token: string) =>
    (await statusReportPage.generateMetadata({ params: Promise.resolve({ orgId, token }) })).title

  const report = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    organizationId: 'org1',
    title: 'Brake pads worn',
    message: 'Front pads are at 2 mm.',
    videoUrl: null,
    videoFileName: null,
    status: 'published',
    createdAt: new Date('2026-11-10T09:00:00Z'),
    expiresAt: new Date('2026-11-24T22:59:59.999Z'),
    viewedAt: new Date('2026-11-10T10:00:00Z'),
    customerFeedback: null,
    feedbackAt: null,
    serviceRecord: {
      title: 'Annual service',
      vehicle: { make: 'Volvo', model: 'V70', year: 2015, licensePlate: 'AB12345' },
    },
    inspection: null,
    technician: { name: 'Ola' },
    organization: { name: WORKSHOP.name },
    ...over,
  })

  it('shows the report and the last day its link works', async () => {
    workshop({ 'workshop.timezone': 'Europe/Oslo' })
    statusReport.findUnique.mockResolvedValue(report())
    await show(await open('org1', 'tok'))
    expect(screen.getByText('Brake pads worn')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This link works until Nov 24, 2026. After that, ask Nordvik Motor for a new one.'
      )
    ).toBeInTheDocument()
  })

  it('tells the customer who to ask when the report has been cleaned up', async () => {
    const { container } = await show(await open('org1', 'cleaned-up'))
    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'It may have been removed, or the address may be incomplete. Contact Nordvik Motor to get a new link.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+47 22 00 00 00' })).toHaveAttribute(
      'href',
      'tel:+4722000000'
    )
    expect(screen.getByRole('link', { name: 'post@nordvik.example' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/Brake|Volvo|404|Dashboard/)
    expect(await title('org1', 'cleaned-up')).toBe('Link not working')
  })

  it('shows the very same page for another workshop’s live report', async () => {
    const gone = (await show(await open('org1', 'nothing'))).container.innerHTML
    statusReport.findUnique.mockResolvedValue(report({ organizationId: 'org2' }))
    const foreign = (await show(await open('org1', 'tok'))).container.innerHTML
    expect(foreign).toBe(gone)
  })

  it('says the link has expired, and nothing of the report, once its day has passed', async () => {
    statusReport.findUnique.mockResolvedValue(
      report({ expiresAt: new Date('2026-11-15T22:59:59.999Z') })
    )
    const { container } = await show(await open('org1', 'tok'))
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/Brake|Volvo/)
    expect(await title('org1', 'tok')).toBe('Link expired')
  })

  it('stays a plain 404 when no workshop answers to the address', async () => {
    await expect(open('nobody', 'tok')).rejects.toBeInstanceOf(NotFound)
  })
})

describe('a quote link', () => {
  const open = (orgId: string, token: string) =>
    quotePage.default({ params: Promise.resolve({ orgId, token }) })
  const title = async (orgId: string, token: string) =>
    (await quotePage.generateMetadata({ params: Promise.resolve({ orgId, token }) })).title

  const shared = (over: Record<string, unknown> = {}) => ({
    id: 'q1',
    organizationId: 'org1',
    customerId: 'cust1',
    sharedAt: new Date('2026-09-01T09:00:00Z'),
    shareRenewedAt: null,
    shareExpiresAt: null,
    shareNeverExpires: false,
    ...over,
  })

  it('is the same page whether the link was removed, mistyped or another workshop’s', async () => {
    const removed = (await show(await open('org1', 'removed'))).container.innerHTML
    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument()

    const mistyped = (await show(await open('nordvik', 'mistypd'))).container.innerHTML
    quote.findFirst.mockResolvedValue(shared({ organizationId: 'org2' }))
    const foreign = (await show(await open('org1', 'tok'))).container.innerHTML

    expect(mistyped).toBe(removed)
    expect(foreign).toBe(removed)
    expect(removed).not.toMatch(/quote/i)
    expect(await title('org1', 'removed')).toBe('Link not working')
  })

  it('says it has expired once the workshop’s days have run out', async () => {
    quote.findFirst.mockResolvedValue(shared())
    await show(await open('org1', 'tok'))
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(
      screen.getByText('Contact Nordvik Motor to get a new link to this quote.')
    ).toBeInTheDocument()
    expect(await title('org1', 'tok')).toBe('Link expired')
  })

  it('stays a plain 404 when no workshop answers to the address', async () => {
    await expect(open('nobody', 'tok')).rejects.toBeInstanceOf(NotFound)
  })
})
