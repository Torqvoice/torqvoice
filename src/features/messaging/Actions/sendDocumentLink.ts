'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { deliverSms } from '@/features/sms/Lib/deliverSms.server'
import { getAppBaseUrl } from '@/lib/app-url'
import type { AuditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { markInvoiceSent, markQuoteSent } from '@/lib/document-lock.server'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeOrgPhone } from '@/lib/sms'
import { interpolateSmsTemplate, SMS_TEMPLATE_DEFAULTS } from '@/lib/sms-templates'
import { sendOrgWhatsapp, WhatsappWindowClosedError } from '@/lib/whatsapp'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(['sms', 'whatsapp']),
  /** As typed in the send dialog: the customer's number, or any other. */
  to: z.string().trim().min(3).max(40),
})

export type SendDocumentLinkInput = z.input<typeof inputSchema>

type DocumentKind = 'quote' | 'invoice' | 'inspection'

interface LinkedDocument {
  token: string
  customer: { id: string; name: string; phone: string | null } | null
  /** Where the document's own page lives, to refresh after the send. */
  path: string
}

const TEMPLATE_KEY: Record<DocumentKind, string> = {
  quote: SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
  invoice: SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
  inspection: SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
}

const customerSelect = { id: true, name: true, phone: true } as const

/**
 * The document with a share link on it, minting one for a document that was
 * never shared, the same way emailing it does. An existing link is kept: a
 * new one would kill the copy the customer already holds.
 */
async function documentWithLink(
  kind: DocumentKind,
  id: string,
  organizationId: string
): Promise<LinkedDocument> {
  if (kind === 'quote') {
    const quote = await db.quote.findFirst({
      where: { id, organizationId },
      select: { publicToken: true, customer: { select: customerSelect } },
    })
    if (!quote) throw new Error('Quote not found')
    const token = quote.publicToken ?? randomUUID()
    if (!quote.publicToken) {
      await db.quote.update({ where: { id }, data: { publicToken: token, sharedAt: new Date() } })
    }
    return { token, customer: quote.customer, path: `/quotes/${id}` }
  }

  if (kind === 'invoice') {
    const record = await db.serviceRecord.findFirst({
      where: { id, organizationId },
      select: {
        publicToken: true,
        vehicleId: true,
        customer: { select: customerSelect },
        // A record on a vehicle carries no customer of its own; the
        // vehicle's is who the invoice goes to.
        vehicle: { select: { customer: { select: customerSelect } } },
      },
    })
    if (!record) throw new Error('Service record not found')
    // Issued before the link exists, so what it shows is the copy that is kept.
    const { issueInvoice } = await import('@/features/invoices/Lib/issueInvoice')
    await issueInvoice(id, organizationId, 'sent')
    const token = record.publicToken ?? randomUUID()
    if (!record.publicToken) {
      await db.serviceRecord.update({
        where: { id },
        data: { publicToken: token, sharedAt: new Date() },
      })
    }
    return {
      token,
      customer: record.customer ?? record.vehicle?.customer ?? null,
      path: record.vehicleId ? `/vehicles/${record.vehicleId}/service/${id}` : `/sales/${id}`,
    }
  }

  const inspection = await db.inspection.findFirst({
    where: { id, organizationId },
    select: { publicToken: true, vehicle: { select: { customer: { select: customerSelect } } } },
  })
  if (!inspection) throw new Error('Inspection not found')
  const token = inspection.publicToken ?? randomUUID()
  if (!inspection.publicToken) {
    await db.inspection.update({ where: { id }, data: { publicToken: token } })
  }
  return { token, customer: inspection.vehicle?.customer ?? null, path: `/inspections/${id}` }
}

/** The workshop's own wording for "your document is ready", with the link in it. */
async function linkMessage(
  kind: DocumentKind,
  organizationId: string,
  userId: string,
  link: string,
  customerName: string
) {
  const key = TEMPLATE_KEY[kind]
  const [setting, org, user] = await Promise.all([
    db.appSetting.findFirst({ where: { organizationId, key }, select: { value: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])
  return interpolateSmsTemplate(setting?.value || SMS_TEMPLATE_DEFAULTS[key] || '', {
    share_link: link,
    customer_name: customerName,
    company_name: org?.name || '',
    current_user: user?.name || '',
  })
}

/**
 * Sends a document's link by text or WhatsApp to the number in the dialog.
 *
 * The message is built here, from the workshop's template and the document's
 * own link, never taken from the browser: the number can be anyone's, so what
 * it receives must not be free text.
 */
async function sendLink(
  kind: DocumentKind,
  raw: SendDocumentLinkInput,
  organizationId: string,
  userId: string
) {
  demoGuard()
  const input = inputSchema.parse(raw)
  await requireFeature(organizationId, input.channel)

  const document = await documentWithLink(kind, input.id, organizationId)
  const link = `${getAppBaseUrl()}/share/${kind}/${organizationId}/${document.token}`
  const body = await linkMessage(kind, organizationId, userId, link, document.customer?.name ?? '')

  const normalized = await normalizeOrgPhone(organizationId, input.to)
  // The message joins the customer's conversation only when it went to the
  // customer's own number. A typed one stands alone under that number.
  const customerNumber = document.customer?.phone
    ? await normalizeOrgPhone(organizationId, document.customer.phone)
    : null
  const customerId =
    normalized && customerNumber === normalized ? (document.customer?.id ?? null) : null

  let messageId: string
  if (input.channel === 'sms') {
    if (!normalized) {
      throw new Error(
        `"${input.to}" is not a phone number we can text. ` +
          'Add the country code, or set a default country in Settings → Localization.'
      )
    }
    const sent = await deliverSms(organizationId, {
      to: normalized,
      body,
      customerId,
      relatedEntityType: kind,
      relatedEntityId: input.id,
    })
    messageId = sent.id
  } else {
    try {
      const sent = await sendOrgWhatsapp(organizationId, {
        to: input.to,
        body,
        customerId: customerId ?? undefined,
        relatedEntityType: kind,
        relatedEntityId: input.id,
      })
      messageId = sent.messageId
    } catch (error) {
      // The 24 hour rule is WhatsApp's, and keeps its own wording.
      if (error instanceof WhatsappWindowClosedError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Could not send WhatsApp message: ${message}`)
    }
    // A text stamps the document as sent inside deliverSms; WhatsApp carries
    // the same link, so it counts the same way.
    if (kind === 'invoice') {
      await markInvoiceSent(input.id, organizationId, { alreadyIssued: true })
    } else if (kind === 'quote') {
      await markQuoteSent(input.id, organizationId)
    }
  }

  revalidatePath(document.path)
  return {
    messageId,
    channel: input.channel,
    token: document.token,
    to: normalized ?? input.to,
    name: document.customer?.name ?? input.to,
  }
}

type SendResult = Awaited<ReturnType<typeof sendLink>>

function auditSend({ result }: { result: SendResult }): AuditEvent {
  return result.channel === 'sms'
    ? {
        action: 'sms.send',
        entity: 'SmsMessage',
        entityId: result.messageId,
        details: { key: 'sms_send', params: { name: result.name, phone: result.to } },
        metadata: { messageId: result.messageId },
      }
    : {
        action: 'whatsapp.send',
        entity: 'WhatsappMessage',
        entityId: result.messageId,
        details: { key: 'whatsapp_send', params: { name: result.name } },
        metadata: { messageId: result.messageId },
      }
}

const sendsToCustomers = { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }

export async function sendQuoteLink(input: SendDocumentLinkInput) {
  return withAuth(
    ({ organizationId, userId }) => sendLink('quote', input, organizationId, userId),
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES },
        sendsToCustomers,
      ],
      audit: auditSend,
    }
  )
}

export async function sendInvoiceLink(input: SendDocumentLinkInput) {
  return withAuth(
    ({ organizationId, userId }) => sendLink('invoice', input, organizationId, userId),
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
        sendsToCustomers,
      ],
      audit: auditSend,
    }
  )
}

export async function sendInspectionLink(input: SendDocumentLinkInput) {
  return withAuth(
    ({ organizationId, userId }) => sendLink('inspection', input, organizationId, userId),
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
        sendsToCustomers,
      ],
      audit: auditSend,
    }
  )
}
