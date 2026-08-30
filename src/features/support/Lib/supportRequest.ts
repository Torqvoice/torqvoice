/**
 * Validation and message building for support requests.
 *
 * Kept free of Next.js and Prisma imports so the rules that decide what is
 * accepted, and what an administrator ends up reading, can be tested directly
 * rather than through a route handler.
 */

/**
 * Total attachment budget. Mail providers reject somewhere between 10MB and
 * 25MB depending on which one is configured, and a rejection surfaces to the
 * user as a failed send after they have already written the report. Staying
 * under the lowest of them is worth more than allowing a larger screenshot.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** One screenshot plus a handful of files. Beyond this it is a bug report, not a ticket. */
export const MAX_ATTACHMENTS = 6

/**
 * Hard ceiling on the whole request, checked against Content-Length before the
 * body is read.
 *
 * This is the only limit that actually protects the server. Every other check
 * here runs on a parsed FormData, and parsing buffers the entire upload into
 * memory first — so by the time an oversized attachment is rejected, the box
 * has already absorbed it. An authenticated user could otherwise post
 * gigabytes and exhaust memory.
 *
 * The allowance over the attachment budget covers multipart boundaries and the
 * subject and message fields.
 */
export const MAX_REQUEST_BYTES = MAX_TOTAL_ATTACHMENT_BYTES + 1024 * 1024

/**
 * Whether a request should be refused before its body is read.
 *
 * A missing Content-Length means a chunked upload, where the size is not known
 * up front. Those are allowed through to the byte counter that runs while
 * attachments are read; the reverse proxy caps them in the meantime.
 */
export function exceedsRequestLimit(contentLength: string | null): boolean {
  if (!contentLength) return false
  const declared = Number(contentLength)
  if (!Number.isFinite(declared)) return false
  return declared > MAX_REQUEST_BYTES
}

export const MAX_SUBJECT_LENGTH = 200
export const MAX_MESSAGE_LENGTH = 5000

/**
 * What support can actually open. Deliberately narrow: this arrives in an
 * administrator's inbox, so executables and archives have no business here
 * even though the sender is authenticated.
 */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
]

/**
 * The file picker's `accept` attribute, derived from the allow list rather than
 * written out again. Spelling it separately let the two drift: the picker
 * offered `image/*`, so a small SVG or an iPhone HEIC could be chosen and was
 * only refused after upload, by which point the user had already waited.
 */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(',')

export interface SupportAttachmentInput {
  filename: string
  contentType: string
  size: number
}

export interface SupportRequestInput {
  subject: string
  message: string
  attachments: SupportAttachmentInput[]
}

export type ValidationFailure =
  | 'subject-required'
  | 'subject-too-long'
  | 'message-required'
  | 'message-too-long'
  | 'too-many-attachments'
  | 'attachment-type-not-allowed'
  | 'attachments-too-large'

export type ValidationResult =
  | { ok: true; subject: string; message: string }
  | { ok: false; reason: ValidationFailure }

export function validateSupportRequest(input: SupportRequestInput): ValidationResult {
  const subject = input.subject.trim()
  const message = input.message.trim()

  if (!subject) return { ok: false, reason: 'subject-required' }
  if (subject.length > MAX_SUBJECT_LENGTH) return { ok: false, reason: 'subject-too-long' }
  if (!message) return { ok: false, reason: 'message-required' }
  if (message.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'message-too-long' }

  if (input.attachments.length > MAX_ATTACHMENTS) {
    return { ok: false, reason: 'too-many-attachments' }
  }

  for (const attachment of input.attachments) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(attachment.contentType)) {
      return { ok: false, reason: 'attachment-type-not-allowed' }
    }
  }

  const total = input.attachments.reduce((sum, a) => sum + a.size, 0)
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'attachments-too-large' }
  }

  return { ok: true, subject, message }
}

/**
 * The subject and message are written by a user and land in an HTML email, so
 * they are escaped rather than interpolated. Without this, a report quoting
 * markup from a page would render as markup in the administrator's client.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip anything that could break a MIME header or escape a directory, and
 * keep the name short. A filename arrives straight from the user's disk.
 */
export function sanitizeFilename(filename: string, fallback: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  if (!cleaned) return fallback
  return cleaned.slice(0, 120)
}

export interface SupportContext {
  organizationName: string
  organizationId: string
  userName: string | null
  userEmail: string
  pageUrl: string | null
  userAgent: string | null
  appVersion: string | null
  submittedAt: string
}

/**
 * A support mail is only useful if it says who is asking and where they were.
 * Chasing a workshop for their organization id and browser is the slowest part
 * of answering a ticket, so all of it travels with the first message.
 */
export function buildSupportEmailHtml(
  subject: string,
  message: string,
  context: SupportContext
): string {
  const rows: [string, string | null][] = [
    ['Organization', `${context.organizationName} (${context.organizationId})`],
    ['From', context.userName ? `${context.userName} <${context.userEmail}>` : context.userEmail],
    ['Page', context.pageUrl],
    ['App version', context.appVersion],
    ['Browser', context.userAgent],
    ['Submitted', context.submittedAt],
  ]

  const detailRows = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:4px 0;color:#111;word-break:break-word;">${escapeHtml(value as string)}</td>
        </tr>`
    )
    .join('')

  return `
    <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="margin:0 0 4px;">${escapeHtml(subject)}</h2>
      <p style="margin:0 0 16px;color:#666;font-size:13px;">Support request from the Torqvoice app</p>
      <div style="white-space:pre-wrap;line-height:1.5;color:#111;">${escapeHtml(message)}</div>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <table style="font-size:13px;border-collapse:collapse;">${detailRows}</table>
    </div>
  `
}
