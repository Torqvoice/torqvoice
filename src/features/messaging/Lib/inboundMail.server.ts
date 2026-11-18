import 'server-only'

import { type ParsedMail, simpleParser } from 'mailparser'
import { isRestoring } from '@/lib/backup/freeze'
import { db } from '@/lib/db'
import { normalizeEmailAddress } from '@/lib/email-address'
import { notify } from '@/lib/notify'
import {
  type InboundMailConfig,
  normalizeMessageId,
  parseReferences,
  replyTokenFromRecipients,
} from '@/lib/reply-mail'
import { organizationForReplyToken } from '@/lib/reply-mail.server'
import { type AttachmentToStore, storeEmailAttachments } from './emailAttachments.server'
import {
  cleanBody,
  cleanSubject,
  headerView,
  isAutomatedMail,
  MAX_MAIL_BYTES,
  type SesReceivedMail,
} from './inboundMail'

/**
 * One inbound mail, from the receiving service's notification to a row in
 * the workshop's inbox.
 *
 * Everything that decides whether a mail is filed happens here, in order:
 * whose it is (the reply token in the recipient address), whether it was
 * already filed (the service's own id is unique), whether it is safe (the
 * virus verdict), whether a person wrote it (the auto-reply headers), and
 * who the person is (the sender's address against the workshop's
 * customers). A mail that fails a rule is dropped with a reason and the
 * delivery is acknowledged, since redelivering it would fail the same
 * rule. Only a failure to fetch or store is thrown, so the service retries.
 */

export interface StoredObject {
  size: number
  /** Reads the bytes; called only when the size is within the limit. */
  read(): Promise<Buffer>
}

export interface ReceiveDeps {
  config: InboundMailConfig
  fetchObject(bucket: string, key: string): Promise<StoredObject>
  parse?(raw: Buffer): Promise<ParsedMail>
  store?(
    organizationId: string,
    files: readonly AttachmentToStore[]
  ): ReturnType<typeof storeEmailAttachments>
  notify?: typeof notify
}

export type ReceiveOutcome =
  | { outcome: 'filed'; id: string; organizationId: string }
  | { outcome: 'dropped'; reason: string }
  /** Nothing was filed or stored; the delivery should come back later. */
  | { outcome: 'retry'; reason: string }

/** The sender's address and display name as the parser read them. */
function senderOf(parsed: ParsedMail): { address: string | null; name: string | null } {
  const first = parsed.from?.value?.[0]
  const address = normalizeEmailAddress(first?.address ?? null)
  const name =
    first?.name
      ?.replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 200) || null
  return { address, name }
}

export async function receiveSesMail(
  mail: SesReceivedMail,
  deps: ReceiveDeps
): Promise<ReceiveOutcome> {
  const { config } = deps
  const parse = deps.parse ?? ((raw: Buffer) => simpleParser(raw))
  const store = deps.store ?? storeEmailAttachments
  const announce = deps.notify ?? notify

  // Whose mail this is. The recipient list is the envelope's, which the
  // receiving service fills in itself; a To header can say anything.
  const token = replyTokenFromRecipients(mail.recipients, config.domain)
  if (!token) return { outcome: 'dropped', reason: 'no reply address among recipients' }
  const organization = await organizationForReplyToken(token)
  if (!organization) return { outcome: 'dropped', reason: 'reply token belongs to no workshop' }
  // A mail filed now would be lost under the restore; SNS retries after it.
  if (isRestoring(organization.id))
    return { outcome: 'retry', reason: 'workshop is being restored' }

  if (mail.bucket !== config.bucket) {
    return { outcome: 'dropped', reason: `stored in an unexpected bucket ${mail.bucket}` }
  }

  // Notifications are delivered at least once. The service's id is unique,
  // so a second delivery finds the first filing and stops.
  const already = await db.emailMessage.findUnique({
    where: { providerMessageId: mail.messageId },
    select: { id: true },
  })
  if (already) return { outcome: 'dropped', reason: 'already filed' }

  if (mail.virusVerdict === 'FAIL') return { outcome: 'dropped', reason: 'virus verdict FAIL' }

  // From here on a failure is the fetch or the database, which a retry can
  // fix, so errors propagate.
  const object = await deps.fetchObject(mail.bucket, mail.objectKey)

  let parsed: ParsedMail | null = null
  if (object.size <= MAX_MAIL_BYTES) {
    parsed = await parse(await object.read())
  }

  const headers = headerView(parsed?.headers)
  const sender = parsed ? senderOf(parsed) : { address: null, name: null }

  if (parsed && isAutomatedMail(headers, sender.address)) {
    return { outcome: 'dropped', reason: 'automated mail' }
  }
  if (!sender.address) {
    return { outcome: 'dropped', reason: parsed ? 'no sender address' : 'mail too large to read' }
  }
  // Our own mail bouncing back through the reply domain, or a workshop
  // writing to its own reply address, is not a customer conversation.
  if (sender.address.endsWith(`@${config.domain}`)) {
    return { outcome: 'dropped', reason: 'sent from the reply domain' }
  }

  const [customer, answered] = await Promise.all([
    db.customer.findFirst({
      where: {
        organizationId: organization.id,
        email: { equals: sender.address, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true },
    }),
    answeredMessage(organization.id, parsed),
  ])

  const attachments = parsed
    ? await store(
        organization.id,
        parsed.attachments
          .filter((attachment) => Buffer.isBuffer(attachment.content))
          .map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            content: attachment.content,
          }))
      )
    : []

  const subject = cleanSubject(parsed?.subject)
  const body = cleanBody(parsed?.text)

  let id: string
  /** The customer whose thread the row went into, if any. */
  let filedUnder: string | null
  try {
    const row = await db.emailMessage.create({
      data: {
        direction: 'inbound',
        kind: 'message',
        address: sender.address,
        fromName: sender.name,
        subject,
        body,
        messageId: normalizeMessageId(parsed?.messageId),
        inReplyTo: answered?.messageId ?? normalizeMessageId(parsed?.inReplyTo),
        providerMessageId: mail.messageId,
        spamVerdict: mail.spamVerdict,
        status: 'received',
        errorMessage: parsed ? null : 'Message exceeded 30 MB; its contents were not kept',
        relatedEntityType: answered?.relatedEntityType ?? null,
        relatedEntityId: answered?.relatedEntityId ?? null,
        organizationId: organization.id,
        // The address decides the customer; the mail being answered only
        // fills in when the address matches nobody, as when a customer
        // answers from a second address.
        customerId: customer?.id ?? answered?.customerId ?? null,
        attachments: attachments.length > 0 ? { create: attachments } : undefined,
      },
      select: { id: true, customerId: true },
    })
    id = row.id
    filedUnder = row.customerId
  } catch (error) {
    // Two deliveries racing past the check above: the unique id lets one in.
    if ((error as { code?: string }).code === 'P2002') {
      return { outcome: 'dropped', reason: 'already filed' }
    }
    throw error
  }

  const who = customer?.name ?? sender.name ?? sender.address
  const preview = subject ?? body.slice(0, 100)
  const contact = encodeURIComponent(sender.address)
  await announce({
    organizationId: organization.id,
    type: 'email_inbound',
    title: 'New email received',
    message: `${who}: ${preview}`.slice(0, 200),
    entityType: 'email_message',
    entityId: id,
    // Where the row went, which is the customer's thread also when only the
    // mail answered named the customer; the address alone would open an
    // empty one.
    entityUrl: filedUnder
      ? `/messages?channel=email&customerId=${filedUnder}`
      : `/messages?channel=email&contact=${contact}`,
  })

  return { outcome: 'filed', id, organizationId: organization.id }
}

/**
 * The mail of ours this one answers, by the ids a reply carries. In-Reply-To
 * names the mail directly; References lists the whole conversation, newest
 * last, for clients that set only that.
 */
async function answeredMessage(organizationId: string, parsed: ParsedMail | null) {
  if (!parsed) return null
  const ids = [
    normalizeMessageId(parsed.inReplyTo),
    ...parseReferences(parsed.references).reverse(),
  ].filter((id): id is string => id !== null)
  if (ids.length === 0) return null

  const candidates = await db.emailMessage.findMany({
    where: { organizationId, direction: 'outbound', messageId: { in: ids.slice(0, 20) } },
    select: {
      messageId: true,
      customerId: true,
      relatedEntityType: true,
      relatedEntityId: true,
    },
  })
  for (const id of ids) {
    const match = candidates.find((candidate) => candidate.messageId === id)
    if (match) return match
  }
  return null
}
