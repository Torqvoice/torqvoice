import 'server-only'
import { db } from '@/lib/db'
import type { Cursor } from '@/lib/keyset'
import { shareExpiry } from '@/lib/share-expiry'
import {
  INVOICE_PAYMENT_COLUMNS,
  loadShareExpiryContext,
  SHARE_FACT_COLUMNS,
  shareFacts,
} from '@/lib/share-link.server'
import type { ShareExpiryView } from '../Schema/shareLinkSchema'
import { toExpiryView } from './shareLinkDocument.server'

/**
 * Every link the workshop has handed out, for the Share links settings page.
 *
 * Whether a link is open is worked out from the workshop's rule, the day the
 * document was paid and the workshop's clock, none of which the database can
 * filter on. So the links are read with a narrow select, sorted and filtered
 * here, and one batch of them is returned.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const SHARE_LINK_BATCH_SIZE = 50

export type ShareLinkRowKind = 'invoice' | 'quote' | 'inspection' | 'statusReport'
export type ShareLinkStatusFilter = 'active' | 'expired' | 'all'

export interface ShareLinkRow {
  kind: ShareLinkRowKind
  id: string
  token: string
  /** The document's number or title. */
  label: string
  /** The vehicle, or the job a status report belongs to. */
  detail: string
  customer: string
  /** The document's page in the app. */
  href: string
  sharedAt: string | null
  viewCount: number | null
  expiry: ShareExpiryView
}

export interface ShareLinkPage {
  /** The workshop the links belong to: every link's address starts with it. */
  organizationId: string
  rows: ShareLinkRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: { active: number; expired: number }
}

/** One batch of the list, as the infinite list loads it while scrolling. */
export interface ShareLinkBatch {
  /** The workshop the links belong to: every link's address starts with it. */
  organizationId: string
  rows: ShareLinkRow[]
  /** Where the next batch starts; null at the end of the list. */
  nextCursor: Cursor | null
  /** Only the first batch carries these. */
  total?: number
  counts?: { active: number; expired: number }
}

export interface ShareLinkFilters {
  status: ShareLinkStatusFilter
  kind: ShareLinkRowKind | 'all'
  search: string
}

export interface ShareLinkQuery {
  status: ShareLinkStatusFilter
  kind: ShareLinkRowKind | 'all'
  search: string
  page: number
  pageSize: number
}

const VEHICLE = {
  select: {
    make: true,
    model: true,
    year: true,
    licensePlate: true,
    customer: { select: { name: true } },
  },
} as const

type VehicleRow = {
  make: string | null
  model: string | null
  year: number | null
  licensePlate: string | null
  customer: { name: string } | null
} | null

function vehicleLabel(v: VehicleRow): string {
  if (!v) return ''
  const name = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return [name, v.licensePlate].filter(Boolean).join(' · ')
}

/** Every link the workshop has handed out, in no particular order. */
async function collectShareLinks(organizationId: string): Promise<ShareLinkRow[]> {
  const context = await loadShareExpiryContext(organizationId)
  const now = new Date()
  const shared = { organizationId, publicToken: { not: null } }

  const [invoices, quotes, inspections, reports] = await Promise.all([
    db.serviceRecord.findMany({
      where: shared,
      select: {
        id: true,
        publicToken: true,
        title: true,
        invoiceNumber: true,
        vehicleId: true,
        viewCount: true,
        customer: { select: { name: true } },
        vehicle: VEHICLE,
        ...SHARE_FACT_COLUMNS,
        ...INVOICE_PAYMENT_COLUMNS,
      },
    }),
    db.quote.findMany({
      where: shared,
      select: {
        id: true,
        publicToken: true,
        title: true,
        quoteNumber: true,
        viewCount: true,
        customer: { select: { name: true } },
        vehicle: VEHICLE,
        ...SHARE_FACT_COLUMNS,
      },
    }),
    db.inspection.findMany({
      where: shared,
      select: {
        id: true,
        publicToken: true,
        template: { select: { name: true } },
        vehicle: VEHICLE,
        ...SHARE_FACT_COLUMNS,
      },
    }),
    // A report is a link from the moment it leaves draft; it carries its own date.
    db.statusReport.findMany({
      where: { organizationId, status: { not: 'draft' } },
      select: {
        id: true,
        publicToken: true,
        title: true,
        sentAt: true,
        createdAt: true,
        expiresAt: true,
        serviceRecord: { select: { id: true, title: true, vehicleId: true, vehicle: VEHICLE } },
        inspection: {
          select: { id: true, template: { select: { name: true } }, vehicle: VEHICLE },
        },
      },
    }),
  ])

  const rows: ShareLinkRow[] = []

  for (const r of invoices) {
    rows.push({
      kind: 'invoice',
      id: r.id,
      token: r.publicToken ?? '',
      label: r.invoiceNumber || r.title,
      detail: vehicleLabel(r.vehicle),
      customer: r.customer?.name ?? r.vehicle?.customer?.name ?? '',
      href: r.vehicleId ? `/vehicles/${r.vehicleId}/service/${r.id}` : `/sales/${r.id}`,
      sharedAt: r.sharedAt?.toISOString() ?? null,
      viewCount: r.viewCount,
      expiry: toExpiryView(
        shareExpiry(shareFacts(r, r), context.rules.invoice, context.timeZone),
        context.rules.invoice,
        context.timeZone,
        now
      ),
    })
  }
  for (const r of quotes) {
    rows.push({
      kind: 'quote',
      id: r.id,
      token: r.publicToken ?? '',
      label: r.quoteNumber || r.title,
      detail: vehicleLabel(r.vehicle),
      customer: r.customer?.name ?? r.vehicle?.customer?.name ?? '',
      href: `/quotes/${r.id}`,
      sharedAt: r.sharedAt?.toISOString() ?? null,
      viewCount: r.viewCount,
      expiry: toExpiryView(
        shareExpiry(shareFacts(r), context.rules.quote, context.timeZone),
        context.rules.quote,
        context.timeZone,
        now
      ),
    })
  }
  for (const r of inspections) {
    rows.push({
      kind: 'inspection',
      id: r.id,
      token: r.publicToken ?? '',
      label: r.template.name,
      detail: vehicleLabel(r.vehicle),
      customer: r.vehicle?.customer?.name ?? '',
      href: `/inspections/${r.id}`,
      sharedAt: r.sharedAt?.toISOString() ?? null,
      viewCount: null,
      expiry: toExpiryView(
        shareExpiry(shareFacts(r), context.rules.inspection, context.timeZone),
        context.rules.inspection,
        context.timeZone,
        now
      ),
    })
  }
  for (const r of reports) {
    const job = r.serviceRecord
    const vehicle = job?.vehicle ?? r.inspection?.vehicle ?? null
    const href = job
      ? job.vehicleId
        ? `/vehicles/${job.vehicleId}/service/${job.id}`
        : `/sales/${job.id}`
      : r.inspection
        ? `/inspections/${r.inspection.id}`
        : '/'
    rows.push({
      kind: 'statusReport',
      id: r.id,
      token: r.publicToken,
      label: r.title || job?.title || r.inspection?.template.name || '',
      detail: vehicleLabel(vehicle),
      customer: vehicle?.customer?.name ?? '',
      href,
      sharedAt: (r.sentAt ?? r.createdAt).toISOString(),
      viewCount: null,
      // A report's date is its own: no workshop rule applies to it.
      expiry: toExpiryView(
        r.expiresAt
          ? { kind: 'date', at: r.expiresAt, source: 'document' }
          : { kind: 'never', source: 'document' },
        { mode: 'never', days: 0 },
        context.timeZone,
        now
      ),
    })
  }

  return rows
}

function countShareLinks(rows: ShareLinkRow[]) {
  return {
    active: rows.filter((r) => !r.expiry.expired).length,
    expired: rows.filter((r) => r.expiry.expired).length,
  }
}

/**
 * A row's place among the links: its kind and id, since an id is only unique
 * within its own kind's table.
 */
export function shareLinkKey(row: Pick<ShareLinkRow, 'kind' | 'id'>) {
  return `${row.kind}:${row.id}`
}

/**
 * Newest first; a link with no known day sorts last. Links shared at the same
 * moment are told apart by kind and id, so a batch always ends at the same
 * place in the list and the next one carries on from there.
 */
function compareShareLinks(
  a: { sharedAt: string | null; key: string },
  b: { sharedAt: string | null; key: string }
) {
  if (a.sharedAt !== b.sharedAt) {
    if (a.sharedAt === null) return 1
    if (b.sharedAt === null) return -1
    return a.sharedAt < b.sharedAt ? 1 : -1
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

function filterShareLinks(rows: ShareLinkRow[], query: ShareLinkFilters) {
  const needle = query.search.trim().toLowerCase()
  return rows
    .filter((r) => query.kind === 'all' || r.kind === query.kind)
    .filter((r) =>
      query.status === 'all'
        ? true
        : query.status === 'expired'
          ? r.expiry.expired
          : !r.expiry.expired
    )
    .filter(
      (r) =>
        !needle || [r.label, r.detail, r.customer].some((s) => s.toLowerCase().includes(needle))
    )
    .sort((a, b) =>
      compareShareLinks(
        { sharedAt: a.sharedAt, key: shareLinkKey(a) },
        { sharedAt: b.sharedAt, key: shareLinkKey(b) }
      )
    )
}

/**
 * One batch of the links, after `cursor` (the last row's shared date and key)
 * or from the top. The first batch also carries the total and the counts the
 * status buttons show.
 */
export async function listShareLinkBatch(
  organizationId: string,
  query: ShareLinkFilters & { cursor?: Cursor | null }
): Promise<ShareLinkBatch> {
  const rows = await collectShareLinks(organizationId)
  const filtered = filterShareLinks(rows, query)
  const cursor = query.cursor
  let start = 0
  if (cursor) {
    const value = cursor.v[0]
    if (cursor.v.length !== 1 || (value !== null && typeof value !== 'string')) {
      throw new Error('Invalid cursor')
    }
    const after = { sharedAt: value, key: cursor.id }
    start = filtered.findIndex(
      (r) => compareShareLinks({ sharedAt: r.sharedAt, key: shareLinkKey(r) }, after) > 0
    )
    if (start === -1) start = filtered.length
  }
  const batch = filtered.slice(start, start + SHARE_LINK_BATCH_SIZE)
  const last = batch[batch.length - 1]
  const more = start + SHARE_LINK_BATCH_SIZE < filtered.length
  return {
    organizationId,
    rows: batch,
    nextCursor: more && last ? { v: [last.sharedAt], id: shareLinkKey(last) } : null,
    total: cursor ? undefined : filtered.length,
    counts: cursor ? undefined : countShareLinks(rows),
  }
}

/** One numbered page of the links (the list before it loaded as it scrolled). */
export async function listShareLinks(
  organizationId: string,
  query: ShareLinkQuery
): Promise<ShareLinkPage> {
  const rows = await collectShareLinks(organizationId)
  const counts = countShareLinks(rows)
  const filtered = filterShareLinks(rows, query)

  const pageSize = Math.min(Math.max(query.pageSize, 1), 100)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(query.page, 1), totalPages)
  return {
    organizationId,
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
    counts,
  }
}
