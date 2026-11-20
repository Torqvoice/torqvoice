import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

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

export interface SharedDocumentFiles {
  organizationId: string
  /** `<category>/<file>` for every upload the document shows. */
  files: Set<string>
}

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

function collect(organizationId: string, urls: (string | null | undefined)[]): Set<string> {
  const files = new Set<string>()
  for (const url of urls) {
    const key = storedFileKey(url, organizationId)
    if (key) files.add(key)
  }
  return files
}

/** The document a token stands for, as the urls of what its page shows. */
async function documentFileUrls(
  token: string
): Promise<{ organizationId: string; urls: (string | null)[] } | null> {
  // A work order or invoice: the files the workshop attached for the customer.
  const record = await db.serviceRecord.findUnique({
    where: { publicToken: token },
    select: {
      organizationId: true,
      attachments: { where: { includeInInvoice: true }, select: { fileUrl: true } },
    },
  })
  if (record?.organizationId) {
    return {
      organizationId: record.organizationId,
      urls: record.attachments.map((file) => file.fileUrl),
    }
  }

  // A quote: its photos and documents.
  const quote = await db.quote.findFirst({
    where: { publicToken: token },
    select: {
      organizationId: true,
      attachments: {
        where: { category: { in: SHOWN_QUOTE_CATEGORIES } },
        select: { fileUrl: true },
      },
    },
  })
  if (quote?.organizationId) {
    return {
      organizationId: quote.organizationId,
      urls: quote.attachments.map((file) => file.fileUrl),
    }
  }

  // An inspection: every check's photos and videos, and the files on the
  // inspection as a whole that the workshop chose to show.
  const inspection = await db.inspection.findFirst({
    where: { publicToken: token },
    select: {
      organizationId: true,
      items: { select: { imageUrls: true } },
      attachments: { where: { includeInReport: true }, select: { fileUrl: true } },
    },
  })
  if (inspection?.organizationId) {
    return {
      organizationId: inspection.organizationId,
      urls: [
        ...inspection.items.flatMap((item) => item.imageUrls),
        ...inspection.attachments.map((file) => file.fileUrl),
      ],
    }
  }

  // A status report: its video, while the report's own page still opens.
  // Its expiry is its own column, which the link checks for the other
  // documents do not read.
  const report = await db.statusReport.findFirst({
    where: { publicToken: token },
    select: { organizationId: true, videoUrl: true, expiresAt: true },
  })
  if (report?.organizationId) {
    const closed = report.expiresAt !== null && report.expiresAt < new Date()
    return { organizationId: report.organizationId, urls: closed ? [] : [report.videoUrl] }
  }

  return null
}

/**
 * The uploads a token opens, or null for a token no document carries.
 */
export async function loadSharedDocumentFiles(token: string): Promise<SharedDocumentFiles | null> {
  const shared = await documentFileUrls(token)
  if (!shared) return null
  const logos = await db.appSetting.findMany({
    where: { organizationId: shared.organizationId, key: { in: LOGO_SETTING_KEYS } },
    select: { value: true },
  })
  return {
    organizationId: shared.organizationId,
    files: collect(shared.organizationId, [
      ...shared.urls,
      ...logos.map((setting) => setting.value.trim()),
    ]),
  }
}

/** Whether the shared document shows this file. */
export function isSharedFile(
  shared: SharedDocumentFiles,
  category: string,
  filename: string
): boolean {
  return shared.files.has(`${category}/${filename}`)
}
