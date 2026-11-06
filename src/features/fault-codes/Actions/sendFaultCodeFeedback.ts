'use server'

import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { getFromAddress, sendMail } from '@/lib/email'
import { isCloudMode } from '@/lib/features'
import { getSupportRecipient } from '@/lib/support'
import { withAuth } from '@/lib/with-auth'
import { buildSupportEmailHtml, supportReplyToAddress } from '@/features/support/Lib/supportRequest'
import { improveFaultCodesSchema } from '../Schema/faultCodeSchema'

/** A few messages an hour per person is plenty; more is a stuck button or a script. */
const LIMIT = 5
const WINDOW_MS = 60 * 60 * 1000
const sent = new Map<string, number[]>()

function allowed(userId: string, now: number): boolean {
  const recent = (sent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= LIMIT) {
    sent.set(userId, recent)
    return false
  }
  sent.set(userId, [...recent, now])
  return true
}

const TOPICS = {
  makes: 'Codes we are missing',
  wrong: 'Something is wrong',
  source: 'A source or link',
  idea: 'An idea',
} as const

/**
 * "Help us improve" on the fault code pages: a workshop tells the Torqvoice team where a
 * make's codes are published, what is wrong, a link worth reading or an idea. Mailed through
 * the platform mailer to the support address (post@torqvoice.com unless the admin set
 * another), with the person as reply-to and the code on screen in the subject. Torqvoice
 * Cloud only: a self-hosted install has nobody at the other end of that address.
 */
export async function sendFaultCodeFeedback(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    demoGuard()
    if (!isCloudMode()) throw new Error('Messages to Torqvoice are sent from Torqvoice Cloud.')
    const data = improveFaultCodesSchema.parse(input)
    if (!allowed(userId, Date.now())) return { sent: false as const, reason: 'limited' as const }

    const [organization, user] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ])
    if (!user?.email) throw new Error('Your account has no email address to reply to.')

    const subject = ['Fault codes', data.topic ? TOPICS[data.topic] : 'Help us improve', data.code]
      .filter(Boolean)
      .join(': ')
    const html = buildSupportEmailHtml(subject, data.message, {
      organizationName: organization?.name ?? 'Unknown organization',
      organizationId,
      userName: user.name,
      userEmail: user.email,
      pageUrl: data.page ?? null,
      userAgent: null,
      appVersion: process.env.APP_VERSION || null,
      submittedAt: new Date().toISOString(),
    })
    // The platform mailer, not the workshop's own: this is mail to Torqvoice.
    const [from, to] = await Promise.all([getFromAddress(), getSupportRecipient()])
    await sendMail({
      from,
      to,
      replyTo: supportReplyToAddress(user.name, user.email),
      subject: `[Improve] ${subject}`,
      html,
    })
    return { sent: true as const }
  })
}
