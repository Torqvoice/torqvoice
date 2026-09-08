/**
 * How a document leaves the building by email.
 *
 * Two ways to send an invoice, a quote or an inspection report. With the PDF
 * attached, which is what a customer who prints things wants. Or as a link to
 * the shared copy, which is what a workshop that chases unpaid invoices wants:
 * the link is the only thing that can be seen to have been opened, so the
 * viewed counter on the document finally means something. A mail carrying the
 * PDF is read in the mail client and the link never gets clicked.
 *
 * The workshop picks a default in settings and either send can override it.
 */

/** Attaching is the old behaviour, so an unset setting keeps it. */
export function attachPdfDefault(settings: Record<string, string>): boolean {
  return settings['email.attachPdf'] !== 'false'
}

/** What this particular send does: the caller's choice, else the workshop's. */
export function resolveAttachPdf(
  settings: Record<string, string>,
  override: boolean | undefined
): boolean {
  return override ?? attachPdfDefault(settings)
}

export interface DocumentEmailBody {
  /** Heading line, e.g. "Invoice INV-1042". */
  heading: string
  /** What the document is about, e.g. "your Volvo V70". Optional. */
  subject?: string
  /** The public link, when the document has one. */
  link?: string | null
  /** Wording of the link, e.g. "View Invoice Online". */
  linkLabel: string
  /** Whether the PDF rides along, which decides the opening line. */
  attached: boolean
  /** The sender's own note. */
  message?: string
  /** Workshop name, and phone when it has one. */
  fromName: string
  phone?: string
}

const html = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * One body for all three documents, so a link-only mail cannot end up saying
 * "please find it attached" in one place and not another.
 *
 * A mail with neither an attachment nor a link would be an empty envelope, so
 * the callers make sure a link exists before they turn the attachment off;
 * should one slip through anyway, the opening line still reads sensibly.
 */
export function buildDocumentEmailHtml(body: DocumentEmailBody): string {
  const { heading, subject, link, linkLabel, attached, message, fromName, phone } = body

  const intro = attached
    ? subject
      ? `Please find the ${subject} attached.`
      : 'Please find it attached.'
    : link
      ? subject
        ? `The ${subject} is ready. Use the link below to view it.`
        : 'It is ready. Use the link below to view it.'
      : subject
        ? `The ${subject} is ready.`
        : 'It is ready.'

  const linkBlock = link
    ? `<p><a href="${html(link)}" style="color: #2563eb;">${html(linkLabel)}</a></p>`
    : ''

  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${html(heading)}</h2>
          <p>${html(intro)}</p>
          ${message ? `<p>${html(message)}</p>` : ''}
          ${linkBlock}
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 14px;">
            ${html(fromName)}${phone ? ` · ${html(phone)}` : ''}
          </p>
        </div>
      `
}
