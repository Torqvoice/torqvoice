import 'server-only'

import { db } from '@/lib/db'
import { effectiveInvoiceDate } from '@/lib/invoice-utils'
import { zonedDayKey } from '@/lib/timezone'
import { parseUploadUrl } from '@/lib/upload-url'
import { workshopMoneyFormatter } from '@/lib/workshop-currency'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import {
  PORTAL_EVENT_DAYS,
  PORTAL_EVENT_MAX_DAYS,
  type PortalChatAttachment,
  type PortalChatEvent,
  type PortalChatMessage,
  type PortalThreadPreview,
} from './chatTypes'
import { portalPayment } from './paymentState'
import { isPortalLive } from './portalLive'
import { loadPortalLook } from './portalLook.server'
import { PORTAL_UPLOAD_FOLDER } from './portalUploads'
import { SENT_TO_CUSTOMER, quoteAwaitsAnswer } from './quoteVisibility'

/**
 * The server side of the portal chat. The home and the shell call
 * `getPortalThreadPreview` and `countPortalUnread`, whose names and return
 * types are fixed (see chatTypes.ts); the chat's own actions (`Actions/
 * sendPortalMessage`, `getPortalThread`, `markPortalMessagesRead`) and the
 * workshop's inbox (`features/messaging`) use the rest.
 *
 * Not server actions: these take the organization and customer as arguments,
 * which come from the session and never from a visitor.
 */

/** How many of the latest messages the home and the Messages page start with. */
export const PORTAL_THREAD_PAGE = 30

const IMAGE = /\.(jpe?g|png|webp|avif|gif|heic)$/i
const VIDEO = /\.(mp4|mov|webm|m4v)$/i

/**
 * Where a customer reads a file they or the workshop sent: the portal's own
 * file route, which checks their session. A message stores the file's url as
 * every upload is stored (`/api/protected/files/<org>/portal-uploads/<name>`),
 * which only the workshop's staff can open.
 */
export function portalFileUrl(organizationId: string, storedUrl: string): string {
  const name = storedUrl.split('?')[0].split('/').pop() ?? ''
  // Under /portal, not /api: the customer's session cookie is only sent to
  // addresses that start with /portal.
  return `/portal/${organizationId}/files/${encodeURIComponent(name)}`
}

/**
 * The stored url of a file in the portal's upload folder of this workshop,
 * or null for anything else: another workshop's file, another folder, a url
 * that is not one of ours. What a message from the workshop may carry: its
 * staff may send any file of the folder. What a customer may attach is
 * narrower, their own uploads only: see portalUploadOwner.server.ts.
 */
export function workshopPortalUpload(organizationId: string, url: string): string | null {
  const parts = parseUploadUrl(url)
  if (!parts || parts.organizationId !== organizationId) return null
  if (parts.category !== PORTAL_UPLOAD_FOLDER) return null
  return `/api/protected/files/${organizationId}/${PORTAL_UPLOAD_FOLDER}/${parts.file}`
}

/** A message's stored file urls, as the list the portal draws. */
export function readAttachments(organizationId: string, urls: string[]): PortalChatAttachment[] {
  return urls.filter(Boolean).map((url) => ({
    url: portalFileUrl(organizationId, url),
    kind: IMAGE.test(url) ? 'image' : VIDEO.test(url) ? 'video' : 'file',
  }))
}

/** "Jonas Hansen" is "Jonas" to a customer. */
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null

/** The columns a message is drawn from. */
export const PORTAL_MESSAGE_SELECT = {
  id: true,
  direction: true,
  body: true,
  attachments: true,
  readAt: true,
  createdAt: true,
  author: { select: { name: true } },
} as const

interface PortalMessageRow {
  id: string
  direction: string
  body: string
  attachments: string[]
  readAt: Date | null
  createdAt: Date
  author: { name: string | null } | null
}

/** A stored message as the customer's chat draws it. */
export function toPortalChatMessage(
  organizationId: string,
  row: PortalMessageRow
): PortalChatMessage {
  return {
    id: row.id,
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    body: row.body,
    attachments: readAttachments(organizationId, row.attachments),
    authorName: row.direction === 'outbound' ? firstName(row.author?.name) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }
}

/** Messages from the workshop this customer has not opened: the badge on the Messages tab. */
export async function countPortalUnread(
  organizationId: string,
  customerId: string
): Promise<number> {
  return db.portalMessage.count({
    where: { organizationId, customerId, direction: 'outbound', readAt: null },
  })
}

/**
 * The latest messages of one customer's thread, oldest first, and how many
 * from the workshop they have not seen yet. Reading it marks nothing read.
 */
export async function getPortalThreadPreview(
  organizationId: string,
  customerId: string,
  limit = PORTAL_THREAD_PAGE
): Promise<PortalThreadPreview> {
  const [rows, unread] = await Promise.all([
    db.portalMessage.findMany({
      where: { organizationId, customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PORTAL_MESSAGE_SELECT,
    }),
    countPortalUnread(organizationId, customerId),
  ])
  const messages = rows.reverse().map((row) => toPortalChatMessage(organizationId, row))
  return { unread, messages }
}

/**
 * Whether a customer of this workshop may write: the portal answers and the
 * workshop has not turned the chat off. What was written before stays
 * readable either way.
 */
export async function isPortalChatOpen(organizationId: string): Promise<boolean> {
  const [live, look] = await Promise.all([
    isPortalLive(organizationId),
    loadPortalLook(organizationId),
  ])
  return live && look.messagesEnabled
}

/** A person types a handful of messages a minute; a script does not stop there. */
const SENDS_PER_MINUTE = 12
const SENDS_PER_HOUR = 120

/**
 * Whether this customer may send one more message right now. Counted from
 * the messages themselves, so it holds across servers and restarts and
 * cannot be reset by signing in again.
 */
export async function portalSendAllowed(
  organizationId: string,
  customerId: string,
  now: Date = new Date()
): Promise<boolean> {
  const sent = { organizationId, customerId, direction: 'inbound' }
  const [minute, hour] = await Promise.all([
    db.portalMessage.count({
      where: { ...sent, createdAt: { gte: new Date(now.getTime() - 60_000) } },
    }),
    db.portalMessage.count({
      where: { ...sent, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
    }),
  ])
  return minute < SENDS_PER_MINUTE && hour < SENDS_PER_HOUR
}

/** The most events of one kind a thread shows. */
const EVENTS_PER_KIND = 12

const vehicle = { select: { make: true, model: true } } as const
const carName = (car: { make: string | null; model: string | null } | null | undefined) =>
  [car?.make, car?.model].filter(Boolean).join(' ').trim() || null
/** A long update is a line in the thread, not the whole text. */
const shorten = (text: string | null | undefined, max = 140) => {
  const clean = text?.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/**
 * What happened to this customer's cars and papers, for the thread: work
 * started on a car, an update the workshop shared, a quote sent, an invoice
 * issued. Read from the records themselves, oldest first, from `since` on:
 * the last 30 days unless told otherwise, and never further back than half a
 * year. The thread is about the messages; old paperwork has its own pages.
 *
 * A thread never fails because of these: any read that breaks leaves the
 * events out and the messages stand.
 */
export async function getPortalThreadEvents(
  organizationId: string,
  customerId: string,
  orgParam: string,
  options: { since?: Date; now?: Date } = {}
): Promise<PortalChatEvent[]> {
  const now = options.now ?? new Date()
  const floor = new Date(now.getTime() - PORTAL_EVENT_MAX_DAYS * 86_400_000)
  const asked = options.since ?? new Date(now.getTime() - PORTAL_EVENT_DAYS * 86_400_000)
  const since = asked > floor ? asked : floor
  const mine = { organizationId, OR: [{ vehicle: { customerId } }, { customerId }] }

  try {
    const [started, updates, quotes, invoices, money, timeZone] = await Promise.all([
      // The first time anyone clocked in on a job is when work on it began.
      db.serviceRecord.findMany({
        where: { ...mine, timeEntries: { some: { organizationId, startedAt: { gte: since } } } },
        select: {
          id: true,
          title: true,
          vehicle,
          timeEntries: {
            where: { organizationId },
            orderBy: { startedAt: 'asc' },
            take: 1,
            select: { startedAt: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: EVENTS_PER_KIND,
      }),
      // Only updates that were sent, and whose page still opens.
      db.statusReport.findMany({
        where: {
          organizationId,
          serviceRecord: mine,
          sentAt: { gte: since },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          id: true,
          publicToken: true,
          message: true,
          title: true,
          sentAt: true,
          serviceRecord: { select: { vehicle } },
        },
        orderBy: { sentAt: 'desc' },
        take: EVENTS_PER_KIND,
      }),
      db.quote.findMany({
        where: { customerId, organizationId, ...SENT_TO_CUSTOMER },
        select: {
          id: true,
          title: true,
          quoteNumber: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          sentAt: true,
          sharedAt: true,
          vehicle,
        },
        orderBy: { updatedAt: 'desc' },
        take: EVENTS_PER_KIND,
      }),
      // An invoice is a finished job that has reached the customer.
      db.serviceRecord.findMany({
        where: {
          ...mine,
          status: 'completed',
          AND: [
            { OR: [{ issuedAt: { not: null } }, { sentAt: { not: null } }] },
            invoiceEventWindow(since),
          ],
        },
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          totalAmount: true,
          issuedAt: true,
          sentAt: true,
          invoiceDate: true,
          startDateTime: true,
          serviceDate: true,
          invoiceDueDate: true,
          manuallyPaid: true,
          payments: { select: { amount: true } },
          vehicle,
        },
        orderBy: { updatedAt: 'desc' },
        take: EVENTS_PER_KIND,
      }),
      workshopMoneyFormatter(organizationId),
      workshopTimeZone(organizationId),
    ])

    const events: PortalChatEvent[] = []
    for (const job of started) {
      const at = job.timeEntries[0]?.startedAt
      // Work that began before the thread's window is old news.
      if (!at || at < since) continue
      events.push({
        id: `work_started:${job.id}`,
        kind: 'work_started',
        at: at.toISOString(),
        dayOnly: false,
        vehicle: carName(job.vehicle),
        title: job.title || null,
        amount: null,
        href: null,
        answerable: false,
        overdue: false,
      })
    }
    for (const report of updates) {
      if (!report.sentAt) continue
      events.push({
        id: `update:${report.id}`,
        kind: 'update',
        at: report.sentAt.toISOString(),
        dayOnly: false,
        vehicle: carName(report.serviceRecord?.vehicle),
        title: shorten(report.message) ?? shorten(report.title),
        amount: null,
        href: `/share/status-report/${orgParam}/${report.publicToken}`,
        answerable: false,
        overdue: false,
      })
    }
    for (const quote of quotes) {
      const at = quote.sentAt ?? quote.sharedAt
      if (!at || at < since) continue
      events.push({
        id: `quote:${quote.id}`,
        kind: 'quote',
        at: at.toISOString(),
        dayOnly: false,
        vehicle: carName(quote.vehicle),
        title: quote.title || quote.quoteNumber || null,
        amount: money(quote.totalAmount),
        href: `/portal/${orgParam}/quotes/${quote.id}`,
        answerable: quoteAwaitsAnswer(quote, timeZone, now),
        overdue: false,
      })
    }
    const today = zonedDayKey(now, timeZone)
    for (const invoice of invoices) {
      const { at, dayOnly } = invoiceEventTime(invoice)
      if (at < since) continue
      // Overdue is owed money past its due day, and that day is the workshop's.
      const owed = portalPayment(invoice).balance > 0
      const overdue =
        owed && !!invoice.invoiceDueDate && zonedDayKey(invoice.invoiceDueDate, timeZone) < today
      events.push({
        id: `invoice:${invoice.id}`,
        kind: 'invoice',
        at: at.toISOString(),
        dayOnly,
        vehicle: carName(invoice.vehicle),
        title: invoice.invoiceNumber || invoice.title || null,
        amount: money(invoice.totalAmount),
        href: `/portal/${orgParam}/invoices/${invoice.id}`,
        answerable: false,
        overdue,
      })
    }
    return events.sort((a, b) => a.at.localeCompare(b.at))
  } catch (error) {
    console.error('[portal chat] events:', error)
    return []
  }
}

/**
 * When an invoice stands in the thread: the moment the customer would
 * recognise.
 *
 * That is when it was sent to them, a real moment with a time of day. An
 * invoice that was never sent (shared by link only, or paid at the counter)
 * stands on its own date, the one printed on it and shown on its page in the
 * portal (`effectiveInvoiceDate`: the invoice date, else the scheduled start,
 * else the day of the work): a calendar day, so the chat shows the day and
 * no clock time. `issuedAt` is never it: that is when the sheet was frozen,
 * which can be a payment weeks after the work, and its time of day means
 * nothing to a customer.
 *
 * `invoiceEventWindow` is the same precedence as a query: change both together.
 */
export function invoiceEventTime(invoice: {
  sentAt: Date | null
  invoiceDate?: Date | null
  startDateTime?: Date | null
  serviceDate: Date
}): { at: Date; dayOnly: boolean } {
  if (invoice.sentAt) return { at: invoice.sentAt, dayOnly: false }
  return { at: effectiveInvoiceDate(invoice), dayOnly: true }
}

/**
 * The invoices whose place in the thread (`invoiceEventTime`) is on or after
 * `since`, as a Prisma filter. Each fallback only counts for a row that has
 * no date of higher rank, so the rows the query returns are the rows that
 * are drawn: a filter on any of the dates let old invoices in by a date that
 * is not the one they stand on, and they used up the row limit before being
 * dropped, hiding a recent invoice.
 */
export function invoiceEventWindow(since: Date) {
  return {
    OR: [
      { sentAt: { gte: since } },
      { sentAt: null, invoiceDate: { gte: since } },
      { sentAt: null, invoiceDate: null, startDateTime: { gte: since } },
      { sentAt: null, invoiceDate: null, startDateTime: null, serviceDate: { gte: since } },
    ],
  }
}

/**
 * From when a thread shows events. The window is `days` long, and it never
 * starts before the oldest loaded message while older messages are still
 * unloaded: an event from before them belongs above messages that are not
 * on screen.
 */
export function portalEventsSince(
  messages: PortalChatMessage[],
  options: { moreMessages: boolean; days?: number; now?: Date }
): Date {
  const now = options.now ?? new Date()
  const window = new Date(now.getTime() - (options.days ?? PORTAL_EVENT_DAYS) * 86_400_000)
  const oldest = options.moreMessages && messages[0] ? new Date(messages[0].createdAt) : null
  return oldest && oldest > window ? oldest : window
}
