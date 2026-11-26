/**
 * @vitest-environment node
 *
 * The share links list in Settings loads as it scrolls (getShareLinkRows).
 * The links come from four kinds of document and are sorted in memory, so a
 * batch carries on from the last link's shared date and its kind and id:
 * every link turns up once, newest first, even when many were shared in the
 * same second; the status, kind and search filters hold for every batch; a
 * workshop only sees its own links; and reading them takes the same rights as
 * before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { walkBatches } from '@/__tests__/helpers/in-memory-table'

type Doc = Record<string, any>

const state = vi.hoisted(() => ({
  invoices: [] as Doc[],
  quotes: [] as Doc[],
  inspections: [] as Doc[],
  reports: [] as Doc[],
  options: [] as unknown[],
}))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return {
    db: {
      serviceRecord: inMemoryTable(() => state.invoices),
      quote: inMemoryTable(() => state.quotes),
      inspection: inMemoryTable(() => state.inspections),
      statusReport: inMemoryTable(() => state.reports),
    },
  }
})
// Whether a link is open is the expiry rules' business, tested on their own;
// here each document says outright whether its link has run out.
vi.mock('@/lib/share-link.server', () => ({
  loadShareExpiryContext: async () => ({
    rules: {
      invoice: { mode: 'never', days: 0 },
      quote: { mode: 'never', days: 0 },
      inspection: { mode: 'never', days: 0 },
    },
    timeZone: 'Pacific/Auckland',
  }),
  SHARE_FACT_COLUMNS: {},
  INVOICE_PAYMENT_COLUMNS: {},
  shareFacts: (row: Doc) => row,
}))
vi.mock('@/lib/share-expiry', async (original) => ({
  ...(await original<typeof import('@/lib/share-expiry')>()),
  shareExpiry: (facts: Doc) => facts,
}))
vi.mock('@/features/share-links/Lib/shareLinkDocument.server', async (original) => ({
  ...(await original<typeof import('@/features/share-links/Lib/shareLinkDocument.server')>()),
  toExpiryView: (expiry: Doc) => ({
    expired: expiry.expired === true || (expiry.kind === 'date' && expiry.at < new Date()),
  }),
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options?: unknown
  ) => {
    state.options.push(options)
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
}))

import { getShareLinkRows } from '@/features/share-links/Actions/getShareLinkRows'

/** Shared on one of a few days, so plenty of links share a moment. */
function sharedOn(i: number) {
  return i % 9 === 0 ? null : new Date(Date.UTC(2026, 10, 1 + (i % 4), 9))
}

const vehicle = {
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  licensePlate: 'AB 12345',
  customer: null,
}

function makeDocuments() {
  state.invoices = Array.from({ length: 70 }, (_, i) => ({
    id: `inv-${String((i * 17) % 70).padStart(2, '0')}`,
    organizationId: i % 10 === 9 ? 'org-2' : 'org-1',
    publicToken: `t-inv-${i}`,
    title: i % 3 === 0 ? 'Brake job' : 'Oil service',
    invoiceNumber: `INV-${i}`,
    vehicleId: 'v1',
    viewCount: i,
    customer: { name: i % 2 === 0 ? 'Kari' : 'Ola' },
    vehicle,
    sharedAt: sharedOn(i),
    expired: i % 4 === 0,
  }))
  state.quotes = Array.from({ length: 45 }, (_, i) => ({
    id: `quo-${String((i * 13) % 45).padStart(2, '0')}`,
    organizationId: 'org-1',
    publicToken: i % 8 === 7 ? null : `t-quo-${i}`,
    title: 'Brake quote',
    quoteNumber: `Q-${i}`,
    viewCount: 0,
    customer: { name: 'Per' },
    vehicle,
    sharedAt: sharedOn(i + 1),
    expired: i % 5 === 0,
  }))
  state.inspections = Array.from({ length: 30 }, (_, i) => ({
    id: `ins-${String((i * 7) % 30).padStart(2, '0')}`,
    organizationId: 'org-1',
    publicToken: `t-ins-${i}`,
    template: { name: 'Annual check' },
    vehicle,
    sharedAt: sharedOn(i + 2),
    expired: false,
  }))
  state.reports = Array.from({ length: 20 }, (_, i) => ({
    id: `rep-${String(i).padStart(2, '0')}`,
    organizationId: 'org-1',
    status: i % 5 === 0 ? 'draft' : 'sent',
    publicToken: `t-rep-${i}`,
    title: 'Progress video',
    sentAt: sharedOn(i + 3),
    createdAt: new Date(Date.UTC(2026, 9, 1)),
    expiresAt: i % 3 === 0 ? new Date(Date.UTC(2020, 0, 1)) : null,
    serviceRecord: { id: 'job-1', title: 'Brake job', vehicleId: 'v1', vehicle },
    inspection: null,
  }))
}

beforeEach(() => {
  makeDocuments()
  state.options = []
})

/** Every row of every batch, in the order the list was handed them. */
function walk(filters: { status?: string; kind?: string; search?: string }) {
  return walkBatches(getShareLinkRows, (cursor) => ({ ...filters, cursor }))
}

describe('the share links list in batches', () => {
  it('shows every link once, newest first, with unknown days last', async () => {
    const { rows } = await walk({ status: 'all' })
    const keys = rows.map((r) => `${r.kind}:${r.id}`)
    expect(new Set(keys).size).toBe(keys.length)

    // Every shared document of the workshop, and each report out of draft.
    const expectedCount =
      state.invoices.filter((d) => d.organizationId === 'org-1').length +
      state.quotes.filter((d) => d.publicToken).length +
      state.inspections.length +
      state.reports.filter((d) => d.status !== 'draft').length
    expect(rows).toHaveLength(expectedCount)

    const days = rows.map((r) => r.sharedAt)
    const known = days.filter((d): d is string => d !== null)
    expect(known).toEqual([...known].sort().reverse())
    expect(days.slice(known.length).every((d) => d === null)).toBe(true)
  })

  it('sends 50 rows, the total and the counts with the first batch only', async () => {
    const first = await getShareLinkRows({ status: 'all' })
    expect(first.data?.rows).toHaveLength(50)
    expect(first.data?.organizationId).toBe('org-1')
    const counts = first.data?.counts
    expect(counts && counts.active + counts.expired).toBe(first.data?.total)

    const second = await getShareLinkRows({ status: 'all', cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
    expect(second.data?.counts).toBeUndefined()
  })

  it('keeps the status, kind and search filters on every batch', async () => {
    const expired = await walk({ status: 'expired' })
    expect(expired.rows.length).toBeGreaterThan(0)
    expect(expired.rows.every((r) => r.expiry.expired)).toBe(true)

    const active = await walk({})
    expect(active.rows.every((r) => !r.expiry.expired)).toBe(true)

    const first = await getShareLinkRows({ status: 'all' })
    expect(expired.rows.length + active.rows.length).toBe(first.data?.total)

    const invoices = await walk({ status: 'all', kind: 'invoice', search: 'kari' })
    expect(invoices.rows.length).toBeGreaterThan(0)
    expect(invoices.rows.every((r) => r.kind === 'invoice')).toBe(true)
    expect(invoices.rows).toHaveLength(
      state.invoices.filter((d) => d.organizationId === 'org-1' && d.customer.name === 'Kari')
        .length
    )
  })

  it('never shows another workshop its links', async () => {
    const { ids } = await walk({ status: 'all' })
    const theirs = state.invoices.filter((d) => d.organizationId === 'org-2').map((d) => d.id)
    expect(theirs.length).toBeGreaterThan(0)
    expect(ids.some((id) => theirs.includes(id))).toBe(false)
  })

  it('takes the right to read settings and every kind of document, as before', async () => {
    await getShareLinkRows({})
    expect(state.options[0]).toEqual({
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
        { action: PermissionAction.READ, subject: PermissionSubject.QUOTES },
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    })
  })

  it('keeps an invoice and a quote with the same id apart across a batch boundary', async () => {
    const at = new Date(Date.UTC(2026, 10, 1, 9))
    // 49 newer invoices, then an invoice and a quote shared in the same
    // moment with the same id: the first batch ends on the invoice.
    state.invoices = Array.from({ length: 50 }, (_, i) => ({
      ...state.invoices[0],
      organizationId: 'org-1',
      id: i === 49 ? 'same' : `inv-n${String(i).padStart(2, '0')}`,
      sharedAt: i === 49 ? at : new Date(at.getTime() + (50 - i) * 1000),
    }))
    state.quotes = [{ ...state.quotes[0], id: 'same', publicToken: 't-same', sharedAt: at }]
    state.inspections = []
    state.reports = []

    const first = await getShareLinkRows({ status: 'all' })
    expect(first.data?.nextCursor?.id).toBe('invoice:same')
    const { rows } = await walk({ status: 'all' })
    const same = rows.filter((r) => r.id === 'same').map((r) => r.kind)
    expect(same).toEqual(['invoice', 'quote'])
    expect(rows).toHaveLength(first.data?.total ?? -1)
  })

  it('refuses a cursor that does not fit the list', async () => {
    const result = await getShareLinkRows({ cursor: { v: [3], id: 'invoice:x' } })
    expect(result.success).toBe(false)
  })
})
