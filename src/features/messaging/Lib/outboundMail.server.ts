import 'server-only'

import { db } from '@/lib/db'
import { platformFromAddressAs, type SendMailOptions, usesPlatformMail } from '@/lib/email'
import { normalizeEmailAddress } from '@/lib/email-address'
import { newMailMessageId, replyMailAddress, replyMailDomain } from '@/lib/reply-mail'
import { ensureReplyMailToken } from '@/lib/reply-mail.server'

/**
 * What a customer mail needs so that the answer comes back to the inbox.
 *
 * On the cloud instance, a workshop sending through the platform's address
 * gets three things on every customer mail: the workshop's own name as the
 * sender's name, a Reply-To of `reply-<token>@<reply domain>`, and a
 * Message-ID of ours. The mail is then recorded, so a reply has something to
 * answer and the thread shows what was sent. Everywhere else (a self-hosted
 * install, a workshop with its own mail vendor) this does nothing at all:
 * the mail goes out as it always has and replies reach the workshop's own
 * mailbox.
 */

export interface CustomerThread {
  customerId?: string | null
  /**
   * `message` for something written to the customer in the inbox, which
   * lists the thread; `document` for an invoice, a quote, a reminder or any
   * other mail the app composes, kept for context and listed only once the
   * customer answers.
   */
  kind: 'message' | 'document'
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  /** The customer's Message-ID when this is a reply to their mail. */
  inReplyTo?: string | null
  references?: string[]
}

export interface PreparedCustomerMail {
  headers: Pick<SendMailOptions, 'from' | 'replyTo' | 'messageId' | 'inReplyTo' | 'references'>
  /** Files the mail as sent, or as failed with why. Returns the row's id. */
  record(outcome: {
    status: 'sent' | 'failed'
    subject: string
    body: string
    errorMessage?: string | null
  }): Promise<string>
}

export async function prepareCustomerMail(
  organizationId: string,
  to: string,
  thread: CustomerThread
): Promise<PreparedCustomerMail | null> {
  const domain = replyMailDomain()
  if (!domain) return null
  if (!(await usesPlatformMail(organizationId))) return null

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })
  if (!organization) return null

  const [token, from] = await Promise.all([
    ensureReplyMailToken(organizationId),
    platformFromAddressAs(organization.name),
  ])
  const messageId = newMailMessageId(domain)
  const address = normalizeEmailAddress(to) ?? to.trim().toLowerCase()

  return {
    headers: {
      from,
      replyTo: replyMailAddress(token, domain),
      messageId,
      inReplyTo: thread.inReplyTo ?? undefined,
      references: thread.references,
    },
    async record(outcome) {
      const row = await db.emailMessage.create({
        data: {
          direction: 'outbound',
          kind: thread.kind,
          address,
          subject: outcome.subject.slice(0, 998),
          body: outcome.body,
          messageId,
          inReplyTo: thread.inReplyTo ?? null,
          status: outcome.status,
          errorMessage: outcome.errorMessage?.slice(0, 500) ?? null,
          relatedEntityType: thread.relatedEntityType ?? null,
          relatedEntityId: thread.relatedEntityId ?? null,
          organizationId,
          customerId: thread.customerId ?? null,
        },
        select: { id: true },
      })
      return row.id
    },
  }
}
