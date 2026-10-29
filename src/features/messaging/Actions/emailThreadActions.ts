'use server'

import { requireEmailSending, withPlatformMailAllowance } from '@/features/email/Lib/emailAllowance'
import { sendTemplatedMail } from '@/features/email/Lib/sendTemplatedMail'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { normalizeEmailAddress } from '@/lib/email-address'
import { releaseFiles } from '@/lib/files/manager'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { emailChannelState } from '../Lib/emailChannel.server'
import { cleanSubject, replySubject } from '../Lib/inboundMail'

/**
 * The email threads of the inbox: reading one, answering it, starting one.
 *
 * Email is the one channel where the customer may be nobody we know: a
 * reply can come from an address no customer record carries. Such a thread
 * is filed under the address and can be read, like a WhatsApp thread from an
 * unknown number; answering needs a customer, so the workshop's mail only
 * ever goes to its own customers and never becomes a relay.
 */

export interface EmailThreadRef {
  customerId: string | null
  /** The address a thread with no customer is filed under. */
  contact: string
}

/** Where a thread's rows are: by customer, or by address when there is none. */
function threadWhere(organizationId: string, thread: EmailThreadRef) {
  return thread.customerId
    ? { organizationId, customerId: thread.customerId }
    : { organizationId, customerId: null, address: thread.contact.trim().toLowerCase() }
}

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  kind: true,
  subject: true,
  body: true,
  fromName: true,
  address: true,
  messageId: true,
  status: true,
  errorMessage: true,
  spamVerdict: true,
  relatedEntityType: true,
  relatedEntityId: true,
  createdAt: true,
  attachments: {
    select: { id: true, fileName: true, contentType: true, size: true, url: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

export async function getEmailConversation(thread: EmailThreadRef, limit = 100) {
  return withAuth(
    async ({ organizationId }) => {
      const [messages, customer] = await Promise.all([
        // The newest rows, put back in reading order: a thread longer than
        // the limit shows its latest mail, not its first.
        db.emailMessage
          .findMany({
            where: threadWhere(organizationId, thread),
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 200),
            select: MESSAGE_SELECT,
          })
          .then((rows) => rows.reverse()),
        thread.customerId
          ? db.customer.findFirst({
              where: { id: thread.customerId, organizationId },
              select: { id: true, name: true, email: true },
            })
          : null,
      ])
      return {
        customer,
        /** Where a reply goes: the customer's address, or the thread's. */
        address: customer?.email ?? thread.contact.trim().toLowerCase(),
        messages,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

const MAX_SUBJECT = 200
const MAX_BODY = 20_000

export interface SendEmailMessageInput {
  customerId: string
  subject: string
  body: string
  /** The inbound message being answered, so the customer's client threads it. */
  replyToId?: string | null
}

/**
 * Writes to a customer from the inbox. Goes out through the same door as
 * every customer mail, which on the cloud instance puts the reply address
 * on it and files it in the thread; under the daily allowance on a plan
 * without custom email, like any other platform send.
 */
export async function sendEmailMessage(input: SendEmailMessageInput) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()

      const state = await emailChannelState(organizationId)
      if (state !== 'active') {
        throw new Error(
          state === 'ownVendor'
            ? 'Replies go to your own mail address while you send through your own vendor'
            : 'Email conversations are not available here'
        )
      }
      const sendingMode = await requireEmailSending(organizationId)

      const subject = cleanSubject(input.subject)
      const body = (input.body ?? '').replace(/\r\n?/g, '\n').trim()
      if (!body) throw new Error('Write a message first')
      if (body.length > MAX_BODY) throw new Error('The message is too long')
      if (subject && subject.length > MAX_SUBJECT) throw new Error('The subject is too long')

      const [customer, disabled, sender] = await Promise.all([
        db.customer.findFirst({
          where: { id: input.customerId, organizationId },
          select: { id: true, name: true, email: true },
        }),
        db.appSetting.findUnique({
          where: { organizationId_key: { organizationId, key: 'workshop.emailEnabled' } },
          select: { value: true },
        }),
        db.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ])
      if (!customer) throw new Error('Customer not found')
      const to = normalizeEmailAddress(customer.email)
      if (!to) throw new Error('This customer has no email address')
      if (disabled?.value === 'false') {
        throw new Error('Email sending is disabled. Enable it in Settings.')
      }

      // The mail being answered, from this workshop's own rows only.
      const answered = input.replyToId
        ? await db.emailMessage.findFirst({
            where: { id: input.replyToId, organizationId, direction: 'inbound' },
            select: { messageId: true, inReplyTo: true, subject: true },
          })
        : null
      const references = [answered?.inReplyTo, answered?.messageId].filter((id): id is string =>
        Boolean(id)
      )

      await withPlatformMailAllowance(organizationId, sendingMode, async () =>
        sendTemplatedMail(organizationId, {
          kind: 'message',
          to,
          subject: subject ?? (answered ? replySubject(answered.subject) : undefined),
          context: {
            message: body,
            customerName: customer.name,
            currentUser: sender?.name ?? null,
          },
          thread: {
            customerId: customer.id,
            kind: 'message',
            inReplyTo: answered?.messageId ?? null,
            references,
          },
        })
      )

      return { sent: true, customerId: customer.id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/** Customers with an address, for starting a conversation. */
export async function searchEmailRecipients(search?: string, limit = 30) {
  return withAuth(
    async ({ organizationId }) => {
      const term = search?.trim()
      return db.customer.findMany({
        where: {
          organizationId,
          email: { not: null },
          ...(term
            ? {
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { email: { contains: term, mode: 'insensitive' as const } },
                  { company: { contains: term, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, company: true, email: true },
        orderBy: { name: 'asc' },
        take: Math.min(limit, 100),
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/**
 * Removes our copy of a conversation and the files that came with it. The
 * customer's mailbox keeps theirs. Files go through the file manager, which
 * trashes rather than deletes and keeps anything another row still uses.
 */
export async function deleteEmailConversation(thread: EmailThreadRef) {
  return withAuth(
    async ({ organizationId }) => {
      const where = threadWhere(organizationId, thread)
      const attachments = await db.emailAttachment.findMany({
        where: { message: where },
        select: { url: true },
      })
      const { count } = await db.emailMessage.deleteMany({ where })
      await releaseFiles(
        attachments.map((attachment) => attachment.url),
        { organizationId, reason: 'email conversation deleted' }
      )
      return { deleted: count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
