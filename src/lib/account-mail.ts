import 'server-only'

/**
 * The mails the platform sends to a person about their own account: verify
 * the address, reset the password, confirm a new address, a new device.
 *
 * Written like a mail from a person, not a marketing piece: left-aligned
 * text, a greeting, a few sentences, one ordinary link, a sign-off. No box
 * in the middle of the page, no button. Every mail has a plain-text half.
 * Nothing here is workshop-branded: these go through the platform sender
 * and reach people who may belong to several workshops or none.
 */
export interface AccountMail {
  to: string
  subject: string
  /** The person's name for the greeting; escaped here. */
  name?: string | null
  /** Sentences in order, one paragraph each; escaped here. */
  paragraphs: string[]
  /** The one thing to click, shown as a normal link with its address. */
  link?: { text: string; url: string }
  /** Quieter closing sentences: ignore if not you, expiry. Escaped here. */
  notes?: string[]
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Exported for tests: the two halves of the mail, from one description. */
export function renderAccountMail(mail: AccountMail): { html: string; text: string } {
  const greeting = mail.name ? `Hi ${mail.name.trim()},` : 'Hi,'
  const link = mail.link
  const notes = mail.notes ?? []

  const text = [
    greeting,
    '',
    ...mail.paragraphs.flatMap((p) => [p, '']),
    ...(link ? [`${link.text}: ${link.url}`, ''] : []),
    ...notes.flatMap((n) => [n, '']),
    'Torqvoice',
  ].join('\n')

  const p = (s: string, muted = false) =>
    `<p style="margin: 0 0 14px 0;${muted ? ' color: #555555;' : ''}">${escapeHtml(s)}</p>`

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #111111; text-align: left;">',
    p(greeting),
    ...mail.paragraphs.map((s) => p(s)),
    ...(link
      ? [
          `<p style="margin: 0 0 14px 0;">${escapeHtml(link.text)}: <a href="${escapeHtml(link.url)}" style="color: #1a56db;">${escapeHtml(link.url)}</a></p>`,
        ]
      : []),
    ...notes.map((s) => p(s, true)),
    '<p style="margin: 18px 0 0 0;">Torqvoice</p>',
    '</div>',
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
