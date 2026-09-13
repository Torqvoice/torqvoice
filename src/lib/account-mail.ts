import 'server-only'

/**
 * The mails the platform sends to a person about their own account: verify
 * the address, reset the password, confirm a new address, a new device.
 *
 * One shell for all of them, in the shape people know from GitHub and
 * Google: the wordmark, a white card on a grey page with a heading, a
 * greeting and a few sentences, an optional card of facts, one button, the
 * same link written out for copying, quieter closing notes, and a footer
 * that says why the mail came and to which address. Every mail has a
 * plain-text half. Nothing here is workshop-branded: these go through the
 * platform sender and reach people who may belong to several workshops or
 * none.
 */
/** A row in a facts card: "Device", "Chrome on Windows". */
export interface AccountMailRow {
  label: string
  value: string
}

export type AccountMailBlock = string | { rows: AccountMailRow[] }

export interface AccountMail {
  to: string
  subject: string
  /** Headline inside the card; the subject when not given. Escaped here. */
  heading?: string
  /** The person's name for the greeting; escaped here. */
  name?: string | null
  /**
   * Sentences in order, one paragraph each, or a card of label/value rows
   * where a few facts read better lined up than in a sentence. Escaped here.
   */
  paragraphs: AccountMailBlock[]
  /** The one thing to click: a button, with the address written out under it. */
  link?: { text: string; url: string }
  /** Quieter closing sentences: ignore if not you, expiry. Escaped here. */
  notes?: string[]
  /** Footer: "You are receiving this because <reason>." Escaped here. */
  reason?: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const INK = '#1f2328'
const MUTED = '#59636e'
const LINE = '#d1d9e0'
const PAGE = '#f6f8fa'
const BUTTON = '#1f883d'

/** Exported for tests: the two halves of the mail, from one description. */
export function renderAccountMail(mail: AccountMail): { html: string; text: string } {
  const greeting = mail.name ? `Hi ${mail.name.trim()},` : 'Hi,'
  const heading = mail.heading ?? mail.subject
  const link = mail.link
  const notes = mail.notes ?? []
  const reason = mail.reason ?? 'this is the address on your Torqvoice account'

  const text = [
    greeting,
    '',
    ...mail.paragraphs.flatMap((block) =>
      typeof block === 'string'
        ? [block, '']
        : [...block.rows.map((row) => `${row.label}: ${row.value}`), '']
    ),
    ...(link ? [`${link.text}: ${link.url}`, ''] : []),
    ...notes.flatMap((n) => [n, '']),
    'Torqvoice',
  ].join('\n')

  const p = (s: string, muted = false) =>
    `<p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.55;${muted ? ` color: ${MUTED};` : ''}">${escapeHtml(s)}</p>`

  // Tables throughout: the one layout element mail clients render alike.
  const card = (rows: AccountMailRow[]) =>
    [
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0; background: ${PAGE}; border: 1px solid ${LINE}; border-radius: 6px; border-collapse: separate; text-align: left;">`,
      ...rows.map((row, i) => {
        const border = i < rows.length - 1 ? ` border-bottom: 1px solid ${LINE};` : ''
        return (
          '<tr>' +
          `<td style="padding: 10px 16px; width: 90px; font-size: 13px; color: ${MUTED}; white-space: nowrap; vertical-align: top;${border}">${escapeHtml(row.label)}</td>` +
          `<td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: ${INK}; vertical-align: top;${border}">${escapeHtml(row.value)}</td>` +
          '</tr>'
        )
      }),
      '</table>',
    ].join('\n')

  const button = (l: { text: string; url: string }) =>
    [
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 6px 0 14px 0;">',
      `<tr><td style="background: ${BUTTON}; border-radius: 6px;">`,
      `<a href="${escapeHtml(l.url)}" style="display: inline-block; padding: 11px 20px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">${escapeHtml(l.text)}</a>`,
      '</td></tr>',
      '</table>',
      `<p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.5; color: ${MUTED}; word-break: break-all;">Or copy this link into your browser: <a href="${escapeHtml(l.url)}" style="color: ${MUTED};">${escapeHtml(l.url)}</a></p>`,
    ].join('\n')

  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${PAGE}; font-family: ${FONT};">`,
    '<tr><td align="center" style="padding: 32px 16px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; color: ${INK}; text-align: left;">`,
    `<tr><td style="padding: 0 0 20px 0; font-size: 18px; font-weight: 700; color: ${INK};">Torqvoice</td></tr>`,
    `<tr><td style="background: #ffffff; border: 1px solid ${LINE}; border-radius: 8px; padding: 32px;">`,
    `<h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 600; line-height: 1.3; color: ${INK};">${escapeHtml(heading)}</h1>`,
    p(greeting),
    ...mail.paragraphs.map((block) => (typeof block === 'string' ? p(block) : card(block.rows))),
    ...(link ? [button(link)] : []),
    ...notes.map((s) => p(s, true)),
    '</td></tr>',
    `<tr><td style="padding: 20px 8px 0 8px; font-size: 12px; line-height: 1.5; color: ${MUTED};">You are receiving this because ${escapeHtml(reason)}: ${escapeHtml(mail.to)}<br>Torqvoice</td></tr>`,
    '</table>',
    '</td></tr>',
    '</table>',
  ].join('\n')

  return { html, text }
}

/** Sends through the platform sender, never a workshop's own provider. */
export async function sendAccountMail(mail: AccountMail): Promise<void> {
  const { sendMail, getFromAddress } = await import('@/lib/email')
  const from = await getFromAddress()
  const { html, text } = renderAccountMail(mail)
  await sendMail({ from, to: mail.to, subject: mail.subject, html, text })
}
