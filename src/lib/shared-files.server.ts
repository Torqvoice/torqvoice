import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import type { ShareKind } from '@/lib/share-expiry'
import { findSharedDocumentOfAnyKind } from '@/lib/share-link.server'

/**
 * Which uploads a share link's token opens.
 *
 * A token stands for one document, so it opens what that document shows the
 * customer and nothing else of the workshop: the files the page draws, read
 * from the same columns and with the same filters the page uses. The
 * workshop's logos are the one exception, since they head every document a
 * workshop sends and any of its links may show them.
 *
 * Each share page turns a stored address into `/api/public/files/<token>/
 * <category>/<file>`. When a page starts drawing a new file, add its column
 * here too, or the customer sees a broken image.
 *
 * A share page with fifty photos asks this fifty times, so the token is
 * looked up once per request, that one lookup also answers whether the link
 * is still open, and each file is a single narrow question ("is this address
 * on this document") rather than a load of everything the document holds.
 */

/** The settings that hold a logo a shared page or its sheet draws. */
const LOGO_SETTING_KEYS = [
  SETTING_KEYS.COMPANY_LOGO,
  SETTING_KEYS.INVOICE_LOGO,
  SETTING_KEYS.QUOTE_LOGO,
  SETTING_KEYS.CERTIFICATE_LOGO,
  SETTING_KEYS.WORK_ORDER_LOGO,
]

/** The quote attachments the share page lists: its photos and its documents. */
const SHOWN_QUOTE_CATEGORIES = ['image', 'document']

/** Both forms a stored upload address has had: `/api/protected/files/` and `/api/files/`. */
const STORED_FILE_URL = /^\/api\/(?:protected\/)?files\/([^/]+)\/([^/]+)\/([^/]+)$/

/** The document behind an open link, as much of it as the file check needs. */
export type SharedFileDocument =
  | { kind: ShareKind; id: string; organizationId: string }
  | { kind: 'statusReport'; id: string; organizationId: string; videoUrl: string | null }

export type SharedFileToken =
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'open'; document: SharedFileDocument }

/**
 * The `<category>/<file>` a stored address names, or null when it is not an
 * upload of this workshop. An address under another workshop's folder is
 * never one of this document's files, whatever its file name.
 */
export function storedFileKey(
  url: string | null | undefined,
  organizationId: string
): string | null {
  const match = url ? STORED_FILE_URL.exec(url) : null
  if (!match) return null
  const [, owner, category, file] = match
  if (owner !== organizationId) return null
  return `${category}/${file}`
}

/**
 * Every stored address that names this file: exactly the addresses
 * `storedFileKey` reads back as `<category>/<file>` for this workshop.
 */
export function storedFileUrls(organizationId: string, category: string, file: string): string[] {
  return [
    `/api/protected/files/${organizationId}/${category}/${file}`,
    `/api/files/${organizationId}/${category}/${file}`,
  ]
}

/**
 * The document a token stands for, and whether its link is open. One lookup
 * serves both the expiry check and the file check. Invoices are tried first,
 * being what most links lead to; a status report, which keeps its expiry in
 * a column of its own, last.
 */
export async function resolveSharedFileToken(token: string): Promise<SharedFileToken> {
  const shared = await findSharedDocumentOfAnyKind(token)
  if (shared) {
    if (!shared.open) return { status: 'expired' }
    return {
      status: 'open',
      document: { kind: shared.kind, id: shared.id, organizationId: shared.organizationId },
    }
  }

  const report = await db.statusReport.findFirst({
    where: { publicToken: token },
    select: { id: true, organizationId: true, videoUrl: true, expiresAt: true },
  })
  if (!report?.organizationId) return { status: 'unknown' }
  // A report's video closes with the report's own page, and says so the way
  // every other closed link does.
  if (report.expiresAt !== null && report.expiresAt < new Date()) return { status: 'expired' }
  return {
    status: 'open',
    document: {
      kind: 'statusReport',
      id: report.id,
      organizationId: report.organizationId,
      videoUrl: report.videoUrl,
    },
  }
}

/** Whether the document itself shows a file stored under any of these addresses. */
async function documentShows(document: SharedFileDocument, urls: string[]): Promise<boolean> {
  switch (document.kind) {
    case 'invoice': {
      // A work order or invoice: the files the workshop attached for the customer.
      const row = await db.serviceAttachment.findFirst({
        where: { serviceRecordId: document.id, includeInInvoice: true, fileUrl: { in: urls } },
        select: { id: true },
      })
      return row !== null
    }
    case 'quote': {
      // A quote: its photos and documents.
      const row = await db.quoteAttachment.findFirst({
        where: {
          quoteId: document.id,
          category: { in: SHOWN_QUOTE_CATEGORIES },
          fileUrl: { in: urls },
        },
        select: { id: true },
      })
      return row !== null
    }
    case 'inspection': {
      // An inspection: every check's photos and videos, and the files on the
      // inspection as a whole that the workshop chose to show.
      const item = await db.inspectionItem.findFirst({
        where: { inspectionId: document.id, imageUrls: { hasSome: urls } },
        select: { id: true },
      })
      if (item) return true
      const attachment = await db.inspectionAttachment.findFirst({
        where: { inspectionId: document.id, includeInReport: true, fileUrl: { in: urls } },
        select: { id: true },
      })
      return attachment !== null
    }
    case 'statusReport':
      // A status report: its video.
      return document.videoUrl !== null && urls.includes(document.videoUrl)
  }
}

/** Whether the file is one of the workshop's logos. */
async function isWorkshopLogo(organizationId: string, key: string): Promise<boolean> {
  const logos = await db.appSetting.findMany({
    where: { organizationId, key: { in: LOGO_SETTING_KEYS } },
    select: { value: true },
  })
  return logos.some((setting) => storedFileKey(setting.value.trim(), organizationId) === key)
}

/** Whether the shared document shows this file. */
export async function isSharedFile(
  document: SharedFileDocument,
  category: string,
  filename: string
): Promise<boolean> {
  const { organizationId } = document
  const urls = storedFileUrls(organizationId, category, filename)
  const key = `${category}/${filename}`
  // A logo is asked about on every page of every link; anything else is a
  // file of the document. Both are tried either way, in the likelier order.
  if (category === 'logos') {
    return (await isWorkshopLogo(organizationId, key)) || (await documentShows(document, urls))
  }
  return (await documentShows(document, urls)) || (await isWorkshopLogo(organizationId, key))
}
