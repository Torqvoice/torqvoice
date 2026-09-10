import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { simpleParser } from 'mailparser'
import { SMTPServer } from 'smtp-server'

/**
 * A mail server that delivers nothing.
 *
 * The app refuses to record an invitation it could not mail, and a reset link
 * only exists inside the mail that carries it, so a suite with no mail server
 * can test neither. This is one: it speaks SMTP well enough for nodemailer,
 * keeps what it is given in memory, and hands it back over HTTP so a spec can
 * read the link a person would have clicked.
 *
 * Playwright starts and stops it alongside the app; nothing is installed and
 * nothing leaves the machine. Run on its own with `npx tsx e2e/mail-sink.ts`.
 */

const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 1025)
const API_PORT = Number(process.env.E2E_MAIL_API_PORT ?? 8025)
/** Enough for a run; the oldest fall off so a long run cannot grow without end. */
const KEEP = 200
/** Above this an attachment is listed but not kept: an invoice PDF is tens of kilobytes. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

/** A file the mail carried, kept so a spec can look inside it. */
export interface CapturedAttachment {
  filename: string
  contentType: string
  size: number
  /** The file itself, base64. Absent for anything above the cap below. */
  content?: string
}

export interface CapturedMail {
  /** Every recipient, lower-cased, as the envelope had them. */
  to: string[]
  from: string
  subject: string
  text: string
  html: string
  attachments: CapturedAttachment[]
  receivedAt: string
}

const mailbox: CapturedMail[] = []

/** Who the connection said it was sending as; `false` when it declined to say. */
function envelopeFrom(session: { envelope: { mailFrom: false | { address: string } } }): string {
  return session.envelope.mailFrom ? session.envelope.mailFrom.address : ''
}

const smtp = new SMTPServer({
  // Nothing here is protected and nothing is delivered: a test mail server
  // that demanded credentials would only be a second thing to configure.
  authOptional: true,
  disabledCommands: ['STARTTLS', 'AUTH'],
  onData(stream, session, callback) {
    simpleParser(stream)
      .then((parsed) => {
        const mail: CapturedMail = {
          // The envelope is what the app actually addressed; the header is
          // what it wrote. They agree here, and the envelope is the truth.
          to: session.envelope.rcptTo.map((r) => r.address.toLowerCase()),
          from: parsed.from?.value[0]?.address ?? envelopeFrom(session),
          subject: parsed.subject ?? '',
          text: parsed.text ?? '',
          html: typeof parsed.html === 'string' ? parsed.html : '',
          attachments: (parsed.attachments ?? []).map((a) => ({
            filename: a.filename ?? '',
            contentType: a.contentType ?? '',
            size: a.size ?? a.content?.length ?? 0,
            content:
              a.content && a.content.length <= MAX_ATTACHMENT_BYTES
                ? Buffer.from(a.content).toString('base64')
                : undefined,
          })),
          receivedAt: new Date().toISOString(),
        }
        mailbox.unshift(mail)
        mailbox.length = Math.min(mailbox.length, KEEP)
        const files = mail.attachments.map((a) => a.filename).join(', ')
        console.log(
          `[mail-sink] ${mail.to.join(', ')} — ${mail.subject}${files ? ` (+ ${files})` : ''}`
        )
        callback()
      })
      .catch((err: Error) => callback(err))
  },
})

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

const api = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${API_PORT}`)

  // What Playwright waits for before it starts the run.
  if (url.pathname === '/health') return send(res, 200, { ok: true, smtpPort: SMTP_PORT })

  if (url.pathname === '/messages') {
    if (req.method === 'DELETE') {
      mailbox.length = 0
      return send(res, 200, { cleared: true })
    }
    if (req.method === 'GET') {
      const to = url.searchParams.get('to')?.toLowerCase()
      const matching = to ? mailbox.filter((m) => m.to.includes(to)) : mailbox
      return send(res, 200, matching)
    }
  }

  send(res, 404, { error: 'not found' })
})

smtp.listen(SMTP_PORT, '127.0.0.1', () => {
  console.log(`[mail-sink] SMTP on 127.0.0.1:${SMTP_PORT}`)
})
api.listen(API_PORT, '127.0.0.1', () => {
  console.log(`[mail-sink] messages on http://127.0.0.1:${API_PORT}/messages`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    smtp.close(() => api.close(() => process.exit(0)))
  })
}
