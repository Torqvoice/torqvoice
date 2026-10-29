/**
 * What an inbound email is, before anything is stored: the shape of the
 * receiving service's notification, which mails are machines talking rather
 * than customers, how a reply is separated from the mail it quotes, and
 * which files are kept. No I/O, so every rule here has a test.
 */

/** A mail larger than this is filed without its contents. */
export const MAX_MAIL_BYTES = 30 * 1024 * 1024
/** Text beyond this is cut; a customer's reply is never this long, a forwarded newsletter is. */
export const MAX_BODY_CHARS = 100_000
export const MAX_ATTACHMENTS = 10
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024

/**
 * Files kept from a mail, by type. These are the types the file route
 * serves with a content type of their own, so what is kept can be opened.
 * Anything else (an archive, a program, an HTML page) is left out.
 */
export const KEPT_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
])

// ─── The receiving service's notification ───────────────────────────────────

export interface SesReceivedMail {
  /** The receiving service's id for this mail, also the stored object's key. */
  messageId: string
  bucket: string
  objectKey: string
  recipients: string[]
  spamVerdict: string | null
  virusVerdict: string | null
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function verdict(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const status = (value as { status?: unknown }).status
  return typeof status === 'string' ? status : null
}

/**
 * The parts of an SES "Received" notification the app acts on, or null for
 * anything that is not one: a different notification type, a receipt rule
 * action other than storing to S3, or a shape with something missing.
 */
export function parseSesReceivedNotification(input: unknown): SesReceivedMail | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (raw.notificationType !== 'Received') return null

  const mail = raw.mail as Record<string, unknown> | undefined
  const receipt = raw.receipt as Record<string, unknown> | undefined
  if (!mail || typeof mail !== 'object' || !receipt || typeof receipt !== 'object') return null

  const messageId = mail.messageId
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(messageId)) return null

  const recipients = receipt.recipients
  if (!isStringArray(recipients) || recipients.length === 0) return null

  const action = receipt.action as Record<string, unknown> | undefined
  if (!action || action.type !== 'S3') return null
  const bucket = action.bucketName
  const objectKey = action.objectKey
  if (typeof bucket !== 'string' || !bucket) return null
  if (typeof objectKey !== 'string' || !objectKey || objectKey.length > 1024) return null

  return {
    messageId,
    bucket,
    objectKey,
    recipients,
    spamVerdict: verdict(receipt.spamVerdict),
    virusVerdict: verdict(receipt.virusVerdict),
  }
}

// ─── Machines writing, not customers ────────────────────────────────────────

export interface MailHeaderView {
  /** A header's value, lower-cased, or null when it is not present. */
  get(name: string): string | null
}

/** A header map from the parser's, or from a plain record in a test. */
export function headerView(
  headers: Map<string, unknown> | Record<string, unknown> | undefined
): MailHeaderView {
  const read = (name: string): unknown => {
    if (!headers) return undefined
    if (headers instanceof Map) return headers.get(name.toLowerCase())
    return headers[name.toLowerCase()] ?? headers[name]
  }
  return {
    get(name) {
      const value = read(name)
      if (value === undefined || value === null) return null
      if (typeof value === 'string') return value.toLowerCase()
      if (Array.isArray(value)) return value.map(String).join(', ').toLowerCase()
      if (typeof value === 'object') {
        const inner = value as { value?: unknown; text?: unknown }
        if (typeof inner.value === 'string') return inner.value.toLowerCase()
        if (typeof inner.text === 'string') return inner.text.toLowerCase()
      }
      return String(value).toLowerCase()
    },
  }
}

const SYSTEM_SENDER =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?)(\+|@|-|_|\.|$)/i

/**
 * Whether a mail was generated rather than written: an out-of-office
 * answer, a bounce, a list mailing. Filing these would put a thread in the
 * inbox for every holiday auto-reply to an invoice run, so they are dropped
 * on the headers mail systems set for exactly this purpose.
 */
export function isAutomatedMail(headers: MailHeaderView, fromAddress: string | null): boolean {
  const autoSubmitted = headers.get('auto-submitted')
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (headers.get('x-auto-response-suppress') !== null) return true
  if (headers.get('x-autoreply') !== null || headers.get('x-autorespond') !== null) return true

  const precedence = headers.get('precedence')
  if (precedence && /\b(bulk|junk|list|auto_reply)\b/.test(precedence)) return true

  const contentType = headers.get('content-type')
  if (contentType?.startsWith('multipart/report')) return true

  if (headers.get('list-id') !== null || headers.get('list-unsubscribe') !== null) return true

  if (fromAddress && SYSTEM_SENDER.test(fromAddress)) return true
  return false
}

// ─── The reply and what it quotes ───────────────────────────────────────────

/**
 * The line a mail client writes above the quoted mail, in the languages the
 * app speaks: "On <date>, <who> wrote:" and its equivalents. The verb sits
 * at the end in English and in the middle in Norwegian or German, so the
 * line is recognised by the verb, the colon it ends with, and the date or
 * address it always carries; a sentence like "he wrote:" has neither.
 * Clients wrap the line, so it is also tried joined with the one after it.
 */
const ATTRIBUTION =
  /^(?=.*[\d@]).{0,400}?(?<!\p{L})(?:wrote|skrev|schrieb|écrit|escribió|escribio|scritto|schreef|napisał(?:\(a\)|a)?|escreveu|rašė|написал[а]?|написав|yazdı)(?!\p{L}).{0,300}?:\s*$/iu

/** Outlook's separators above a quoted mail, in a few spellings. */
const SEPARATOR =
  /^\s*(?:-{3,}\s*(?:original message|opprinnelig melding|ursprüngliche nachricht|message d'origine|mensaje original|messaggio originale|oorspronkelijk bericht|wiadomość oryginalna|mensagem original|исходное сообщение|orijinal ileti)\s*-{3,}|_{10,})\s*$/i

/** Outlook's header block when it has no separator line. */
const HEADER_BLOCK = /^(?:from|fra|von|de|da|van|od|от|kimden|nuo)\s*:\s.+$/i
const HEADER_FOLLOW =
  /^(?:sent|date|to|subject|sendt|til|emne|gesendet|an|betreff|envoyé|à|objet|enviado|para|asunto|assunto|inviato|a|oggetto|verzonden|aan|onderwerp|wysłano|do|temat|отправлено|кому|тема|gönderildi|kime|konu)\s*:\s/i

function isAttribution(lines: string[], index: number): boolean {
  const line = lines[index].trim()
  if (!line) return false
  if (ATTRIBUTION.test(line)) return true
  const next = lines[index + 1]?.trim()
  if (!next || next.startsWith('>')) return false
  return ATTRIBUTION.test(`${line} ${next}`)
}

function isHeaderBlock(lines: string[], index: number): boolean {
  if (!HEADER_BLOCK.test(lines[index].trim())) return false
  const next = lines[index + 1]?.trim() ?? ''
  return HEADER_FOLLOW.test(next)
}

/**
 * The part of a mail the sender wrote, and the part their client quoted
 * underneath. Quoted lines, the attribution line above them and a signature
 * after a `-- ` line are the quoted part; everything up to the first of
 * them is the reply. A mail with nothing before its quote is returned whole,
 * since the sender's words are in there somewhere.
 */
export function splitQuotedReply(text: string): { reply: string; quoted: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let cut = lines.length

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.startsWith('>') || isAttribution(lines, index) || SEPARATOR.test(line)) {
      cut = index
      break
    }
    if (isHeaderBlock(lines, index)) {
      cut = index
      break
    }
    if (line === '-- ' || line === '--') {
      cut = index
      break
    }
  }

  const reply = lines.slice(0, cut).join('\n').trim()
  const quoted = lines.slice(cut).join('\n').trim()
  if (!reply) return { reply: text.trim(), quoted: '' }
  return { reply, quoted }
}

// ─── Files ──────────────────────────────────────────────────────────────────

/**
 * A file name fit to show and to put in a download header: one line, no
 * path, no control characters, at most 120 characters, and the extension
 * the stored file actually has.
 */
export function cleanAttachmentName(name: string | null | undefined, extension: string): string {
  const base = (name ?? '')
    .replace(/[\\/]+/g, ' ')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/["<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  if (!base) return `attachment.${extension}`
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`
}

export interface IncomingFile {
  filename?: string | null
  contentType: string
  size: number
}

/**
 * Which of a mail's files are kept: those of a kept type, within the size
 * limits, up to the count limit, in the order they came. Returns the indexes
 * so the caller can keep its own objects.
 */
export function selectAttachments(files: readonly IncomingFile[]): number[] {
  const kept: number[] = []
  let total = 0
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    if (kept.length >= MAX_ATTACHMENTS) break
    if (!KEPT_ATTACHMENT_TYPES.has(file.contentType.toLowerCase())) continue
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) continue
    if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) continue
    total += file.size
    kept.push(index)
  }
  return kept
}

/** A subject fit to store: one line, at most 998 characters, or null. */
export function cleanSubject(subject: string | null | undefined): string | null {
  const cleaned = (subject ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, 998) : null
}

/** `Re: <subject>`, unless it already is one. */
export function replySubject(subject: string | null | undefined): string {
  const base = cleanSubject(subject) ?? ''
  if (!base) return 'Re:'
  return /^(re|sv|aw|antw|res|odp|ynt|atb|ответ)\s*:/i.test(base) ? base : `Re: ${base}`
}

/** Body text as stored: normalised line endings, no trailing space, cut to the limit. */
export function cleanBody(text: string | null | undefined): string {
  // A NUL byte cannot be stored in a text column, so it goes; other control
  // characters are left alone, since tabs and line breaks are text.
  const normalized = (text ?? '').replace(/\r\n?/g, '\n').split('\u0000').join('').trimEnd()
  return normalized.length > MAX_BODY_CHARS ? normalized.slice(0, MAX_BODY_CHARS) : normalized
}
