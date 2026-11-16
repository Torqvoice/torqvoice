import 'server-only'
import { db } from '@/lib/db'
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
 * here, and one page of them is returned.
 */

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

export async function listShareLinks(
  organizationId: string,
  query: ShareLinkQuery
): Promise<ShareLinkPage> {
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

  const counts = {
    active: rows.filter((r) => !r.expiry.expired).length,
    expired: rows.filter((r) => r.expiry.expired).length,
  }

  const needle = query.search.trim().toLowerCase()
  const filtered = rows
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
    // Newest first; a link with no known day sorts last.
    .sort((a, b) => (b.sharedAt ?? '').localeCompare(a.sharedAt ?? ''))

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
