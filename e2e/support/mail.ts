import { expect } from '@playwright/test'
import type { CapturedAttachment, CapturedMail } from '../mail-sink'

/**
 * Reading what the app posted.
 *
 * The harness runs a mail server that delivers nothing and keeps everything
 * (`e2e/mail-sink.ts`); this is the other end of it. A spec asks for the mail
 * an address was sent and pulls the link out of it, which is as close as a
 * test gets to a person opening their inbox and clicking.
 */

const api = process.env.E2E_MAIL_API ?? 'http://127.0.0.1:8025'

export type { CapturedAttachment, CapturedMail }

/** One file the mail carried, by name, as bytes. */
export function attachment(mail: CapturedMail, name: RegExp): CapturedAttachment {
  const found = mail.attachments.find((a) => name.test(a.filename))
  if (!found) {
    throw new Error(
      `no attachment matching ${name} on "${mail.subject}". Carried: ${
        mail.attachments.map((a) => a.filename).join(', ') || 'nothing'
      }`
    )
  }
  return found
}

/** The bytes of an attachment the sink kept. */
export function attachmentBytes(file: CapturedAttachment): Buffer {
  if (!file.content) throw new Error(`the sink did not keep ${file.filename} (${file.size} bytes)`)
  return Buffer.from(file.content, 'base64')
}

/** Everything the sink holds for an address, newest first. */
export async function mailsTo(address: string): Promise<CapturedMail[]> {
  const response = await fetch(`${api}/messages?to=${encodeURIComponent(address)}`)
  if (!response.ok) {
    throw new Error(`the mail sink answered ${response.status}. Is e2e/mail-sink.ts running?`)
  }
  return (await response.json()) as CapturedMail[]
}

/** Forgets every mail, so a spec can be sure the next one it reads is its own. */
export async function clearMailbox(): Promise<void> {
  const response = await fetch(`${api}/messages`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`the mail sink answered ${response.status} to a clear`)
}

/**
 * The newest mail to an address, waited for. Mail is sent while the request
 * that triggered it is still being answered, so it can arrive a moment after
 * the page says it did.
 */
export async function waitForMail(
  address: string,
  options: { subject?: RegExp; timeout?: number } = {}
): Promise<CapturedMail> {
  let found: CapturedMail | undefined
  await expect(async () => {
    const mails = await mailsTo(address)
    found = options.subject ? mails.find((m) => options.subject?.test(m.subject)) : mails[0]
    expect(found, `a mail to ${address}`).toBeDefined()
  }).toPass({ timeout: options.timeout ?? 20_000 })
  return found as CapturedMail
}

/**
 * The first link in a mail that matches. Mails are written as HTML with a
 * plain-text half beside them, and the address that matters is in both, so
 * whichever half carries it is fine.
 */
export function linkIn(mail: CapturedMail, pattern: RegExp): string {
  const body = `${mail.html}\n${mail.text}`
  const links = body.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
  // `&amp;` is HTML, not part of the address it was written into.
  const link = links.map((l) => l.replace(/&amp;/g, '&')).find((l) => pattern.test(l))
  if (!link) {
    throw new Error(
      `no link matching ${pattern} in "${mail.subject}". Links found: ${links.join(', ') || 'none'}`
    )
  }
  return link
}
