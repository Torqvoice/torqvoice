import 'server-only'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import {
  ALL_SHARE_EXPIRY_SETTING_KEYS,
  invoicePayment,
  isShareExpired,
  readShareExpiryRules,
  type ShareExpiry,
  type ShareExpiryRules,
  shareExpiry,
  type ShareKind,
  type ShareLinkFacts,
} from '@/lib/share-expiry'
import { resolveWorkshopTimeZone } from '@/lib/timezone'

/**
 * The one place a share link's token is checked.
 *
 * Every page and route a customer reaches through a link asks here whether
 * the link is still open, so a link that expired is closed everywhere at
 * once: the page, its PDF, its files, its payment and its answers.
 */

const TIMEZONE_KEYS = ['workshop.timezone', 'workshop.timezoneDetected']

export interface ShareExpiryContext {
  rules: ShareExpiryRules
  timeZone: string
}

/** The workshop's expiry rules and the clock they are counted on. One query. */
export async function loadShareExpiryContext(organizationId: string): Promise<ShareExpiryContext> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [...ALL_SHARE_EXPIRY_SETTING_KEYS, ...TIMEZONE_KEYS] } },
    select: { key: true, value: true },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return {
    rules: readShareExpiryRules(map),
    timeZone: resolveWorkshopTimeZone(map['workshop.timezone'], map['workshop.timezoneDetected']),
  }
}

/** The columns every shared document carries about its own link. */
export const SHARE_FACT_COLUMNS = {
  sharedAt: true,
  shareRenewedAt: true,
  shareExpiresAt: true,
  shareNeverExpires: true,
} as const

/** What an invoice's link also needs: whether it is paid, and when. */
export const INVOICE_PAYMENT_COLUMNS = {
  totalAmount: true,
  manuallyPaid: true,
  manuallyPaidAt: true,
  payments: { select: { amount: true, date: true } },
} as const

type FactRow = {
  sharedAt: Date | null
  shareRenewedAt: Date | null
  shareExpiresAt: Date | null
  shareNeverExpires: boolean
}

type InvoicePaymentRow = Parameters<typeof invoicePayment>[0]

export function shareFacts(row: FactRow, invoice?: InvoicePaymentRow): ShareLinkFacts {
  return {
    sharedAt: row.sharedAt,
    renewedAt: row.shareRenewedAt,
    expiresAt: row.shareExpiresAt,
    neverExpires: row.shareNeverExpires,
    payment: invoice ? invoicePayment(invoice) : undefined,
  }
}

export interface SharedDocument {
  id: string
  organizationId: string
  expiry: ShareExpiry
  /** False once the link has expired. A portal customer's own document stays open. */
  open: boolean
}

interface Found {
  id: string
  organizationId: string
  customerIds: (string | null | undefined)[]
  facts: (context: ShareExpiryContext) => ShareLinkFacts
}

async function findByToken(kind: ShareKind, token: string): Promise<Found | null> {
  if (kind === 'invoice') {
    const row = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        vehicle: { select: { customerId: true } },
        ...SHARE_FACT_COLUMNS,
        ...INVOICE_PAYMENT_COLUMNS,
      },
    })
    if (!row?.organizationId) return null
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerIds: [row.customerId, row.vehicle?.customerId],
      facts: () => shareFacts(row, row),
    }
  }
  if (kind === 'quote') {
    const row = await db.quote.findFirst({
      where: { publicToken: token },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        vehicle: { select: { customerId: true } },
        ...SHARE_FACT_COLUMNS,
      },
    })
    if (!row?.organizationId) return null
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerIds: [row.customerId, row.vehicle?.customerId],
      facts: () => shareFacts(row),
    }
  }
  const row = await db.inspection.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      organizationId: true,
      vehicle: { select: { customerId: true } },
      ...SHARE_FACT_COLUMNS,
    },
  })
  if (!row?.organizationId) return null
  return {
    id: row.id,
    organizationId: row.organizationId,
    customerIds: [row.vehicle?.customerId],
    facts: () => shareFacts(row),
  }
}

/**
 * A customer signed in to the portal reaches their own invoices and quotes
 * through the same pages a link opens. Their session is what lets them in,
 * so an expired link does not shut them out of their own documents.
 */
async function isPortalOwner(found: Found): Promise<boolean> {
  try {
    const session = await getCustomerSession()
    if (!session || session.organizationId !== found.organizationId) return false
    return found.customerIds.some((id) => id === session.customerId)
  } catch {
    // No request to read a cookie from: nobody is signed in.
    return false
  }
}

/**
 * Looks a share link up by its token. Null when no document carries the
 * token, or when it belongs to another workshop than the one in the address.
 * Otherwise the document, and whether its link is still open.
 */
export async function findSharedDocument(
  kind: ShareKind,
  token: string,
  organizationId?: string
): Promise<SharedDocument | null> {
  if (!token) return null
  const found = await findByToken(kind, token)
  if (!found) return null
  if (organizationId && found.organizationId !== organizationId) return null

  const context = await loadShareExpiryContext(found.organizationId)
  const expiry = shareExpiry(found.facts(context), context.rules[kind], context.timeZone)
  const expired = isShareExpired(expiry)
  const open = !expired || (await isPortalOwner(found))
  return { id: found.id, organizationId: found.organizationId, expiry, open }
}

/**
 * The same, when all that is known is the token: the file route serves the
 * pictures of whichever document the token belongs to.
 */
export async function findSharedDocumentOfAnyKind(
  token: string
): Promise<(SharedDocument & { kind: ShareKind }) | null> {
  for (const kind of ['invoice', 'quote', 'inspection'] as const) {
    const doc = await findSharedDocument(kind, token)
    if (doc) return { ...doc, kind }
  }
  return null
}
