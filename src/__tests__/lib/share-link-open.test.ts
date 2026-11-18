/**
 * Every page and route behind a share link asks one function whether the
 * link is still open. A link past its date is closed; the customer who owns
 * the document and is signed in to the portal still gets in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const serviceRecord = { findUnique: vi.fn() }
const quote = { findFirst: vi.fn() }
const inspection = { findUnique: vi.fn() }
const appSetting = { findMany: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { serviceRecord, quote, inspection, appSetting } }))

const getCustomerSession = vi.fn()
vi.mock('@/lib/customer-session', () => ({ getCustomerSession }))

const { findSharedDocument } = await import('@/lib/share-link.server')

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)

function settings(entries: Record<string, string>) {
  appSetting.findMany.mockResolvedValue(
    Object.entries({ 'workshop.timezone': 'Asia/Tokyo', ...entries }).map(([key, value]) => ({
      key,
      value,
    }))
  )
}

const sharedQuote = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  organizationId: 'org1',
  customerId: 'cust1',
  vehicle: null,
  sharedAt: daysAgo(40),
  shareRenewedAt: null,
  shareExpiresAt: null,
  shareNeverExpires: false,
  ...over,
})

const sharedInvoice = (over: Record<string, unknown> = {}) => ({
  ...sharedQuote({ id: 'inv1' }),
  totalAmount: 500,
  manuallyPaid: false,
  manuallyPaidAt: null,
  payments: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  getCustomerSession.mockResolvedValue(null)
  settings({})
})

describe('a share link', () => {
  it('is not found for a token nobody holds', async () => {
    quote.findFirst.mockResolvedValue(null)
    expect(await findSharedDocument('quote', 'nope', 'org1')).toBeNull()
  })

  it('is not found under another workshop’s address', async () => {
    quote.findFirst.mockResolvedValue(sharedQuote())
    expect(await findSharedDocument('quote', 'tok', 'org2')).toBeNull()
  })

  it('stays open when the workshop chose that links never expire', async () => {
    settings({ 'shareLinks.quoteExpiry': 'never' })
    quote.findFirst.mockResolvedValue(sharedQuote())
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(true)
  })

  it('is closed 30 days after sending for a workshop that has set nothing', async () => {
    quote.findFirst.mockResolvedValue(sharedQuote())
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(false)
    quote.findFirst.mockResolvedValue(sharedQuote({ sharedAt: daysAgo(10) }))
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(true)
  })

  it('is closed once the workshop’s days have run out', async () => {
    settings({ 'shareLinks.quoteExpiry': 'afterSharing', 'shareLinks.quoteExpiryDays': '30' })
    quote.findFirst.mockResolvedValue(sharedQuote())
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(false)
  })

  it('is open again after it was sent again', async () => {
    settings({ 'shareLinks.quoteExpiry': 'afterSharing', 'shareLinks.quoteExpiryDays': '30' })
    quote.findFirst.mockResolvedValue(sharedQuote({ shareRenewedAt: daysAgo(2) }))
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(true)
  })

  it('stays open past the workshop’s days when the document says never', async () => {
    settings({ 'shareLinks.quoteExpiry': 'afterSharing', 'shareLinks.quoteExpiryDays': '30' })
    quote.findFirst.mockResolvedValue(sharedQuote({ shareNeverExpires: true }))
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(true)
  })

  it('is closed after the date set on the document, whatever the workshop’s rule', async () => {
    settings({ 'shareLinks.quoteExpiry': 'never' })
    quote.findFirst.mockResolvedValue(sharedQuote({ shareExpiresAt: daysAgo(1) }))
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(false)
  })
})

describe('an invoice link that expires after payment', () => {
  beforeEach(() => {
    settings({ 'shareLinks.invoiceExpiry': 'afterPayment', 'shareLinks.invoiceExpiryDays': '14' })
  })

  it('stays open while the invoice is unpaid, however old the link', async () => {
    serviceRecord.findUnique.mockResolvedValue(sharedInvoice({ sharedAt: daysAgo(400) }))
    expect((await findSharedDocument('invoice', 'tok', 'org1'))?.open).toBe(true)
  })

  it('is closed once the days after payment have run out', async () => {
    serviceRecord.findUnique.mockResolvedValue(
      sharedInvoice({ payments: [{ amount: 500, date: daysAgo(20) }] })
    )
    expect((await findSharedDocument('invoice', 'tok', 'org1'))?.open).toBe(false)
  })

  it('is still open shortly after payment', async () => {
    serviceRecord.findUnique.mockResolvedValue(
      sharedInvoice({ payments: [{ amount: 500, date: daysAgo(3) }] })
    )
    expect((await findSharedDocument('invoice', 'tok', 'org1'))?.open).toBe(true)
  })
})

describe('a customer signed in to the portal', () => {
  beforeEach(() => {
    quote.findFirst.mockResolvedValue(sharedQuote({ shareExpiresAt: daysAgo(1) }))
  })

  it('still opens their own document after its link expired', async () => {
    getCustomerSession.mockResolvedValue({ customerId: 'cust1', organizationId: 'org1' })
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(true)
  })

  it('does not open somebody else’s', async () => {
    getCustomerSession.mockResolvedValue({ customerId: 'cust2', organizationId: 'org1' })
    expect((await findSharedDocument('quote', 'tok', 'org1'))?.open).toBe(false)
  })
})
