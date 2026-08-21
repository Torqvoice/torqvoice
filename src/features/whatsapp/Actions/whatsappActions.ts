'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuard } from '@/lib/demo'
import {
  isWhatsappConfigured,
  isWithinServiceWindow,
  lastInboundAt,
  sendOrgWhatsapp,
  WhatsappWindowClosedError,
  type WhatsappMediaType,
} from '@/lib/whatsapp'

/**
 * Whether the workshop can write to this customer right now, and freely or
 * only through a template.
 *
 * The conversation view asks before showing a compose box, because "your
 * message will arrive as a template" is something the mechanic needs to know
 * while typing, not after sending.
 */
export async function getWhatsappWindowState(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { phone: true },
      })
      if (!customer?.phone) return { configured: false, open: false, lastInboundAt: null }

      const [configured, open, last] = await Promise.all([
        isWhatsappConfigured(organizationId),
        isWithinServiceWindow(organizationId, customer.phone),
        lastInboundAt(organizationId, customer.phone),
      ])

      return { configured, open, lastInboundAt: last }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export interface SendWhatsappToCustomerInput {
  customerId: string
  body?: string
  /** Must be publicly reachable: the provider fetches it at send time. */
  mediaUrl?: string
  mediaType?: WhatsappMediaType
  mediaFilename?: string
  relatedEntityType?: string
  relatedEntityId?: string
}

export async function sendWhatsappToCustomer(input: SendWhatsappToCustomerInput) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'whatsapp')

      if (!input.body && !input.mediaUrl) {
        throw new Error('Write a message or attach a photo.')
      }

      const customer = await db.customer.findFirst({
        where: { id: input.customerId, organizationId },
        select: { id: true, name: true, phone: true },
      })
      if (!customer) throw new Error('Customer not found')
      if (!customer.phone) {
        throw new Error(`${customer.name} has no phone number to reach on WhatsApp.`)
      }

      try {
        const result = await sendOrgWhatsapp(organizationId, {
          to: customer.phone,
          body: input.body,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType,
          mediaFilename: input.mediaFilename,
          customerId: customer.id,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        })

        return {
          id: result.messageId,
          usedTemplate: result.usedTemplate,
          customerName: customer.name,
        }
      } catch (error) {
        // The window rule is a WhatsApp policy, not a fault of the workshop,
        // so it keeps its own wording rather than becoming a send failure.
        if (error instanceof WhatsappWindowClosedError) throw error
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(`Could not send WhatsApp message: ${message}`)
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'whatsapp.send',
        entity: 'WhatsappMessage',
        entityId: result.id,
        details: { key: 'whatsapp_send', params: { name: result.customerName } },
        metadata: { messageId: result.id, usedTemplate: result.usedTemplate },
      }),
    }
  )
}

export async function getWhatsappConversation(customerId: string, limit = 100) {
  return withAuth(
    async ({ organizationId }) => {
      return db.whatsappMessage.findMany({
        where: { organizationId, customerId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          direction: true,
          body: true,
          mediaType: true,
          mediaFilename: true,
          mediaUrl: true,
          templateName: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        },
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
 * Conversations with something in them, most recent first.
 *
 * Messages from a number we could not match to a customer are grouped by that
 * number instead, so a first-time enquiry is not invisible.
 */
export async function getRecentWhatsappThreads(limit = 30) {
  return withAuth(
    async ({ organizationId }) => {
      const messages = await db.whatsappMessage.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          direction: true,
          body: true,
          mediaType: true,
          status: true,
          createdAt: true,
          fromNumber: true,
          toNumber: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
        },
      })

      const threads = new Map<
        string,
        {
          key: string
          customerId: string | null
          name: string
          phone: string
          lastMessage: string
          lastDirection: string
          lastAt: Date
          unread: boolean
        }
      >()

      for (const message of messages) {
        const phone = message.direction === 'inbound' ? message.fromNumber : message.toNumber
        const key = message.customerId ?? phone
        if (threads.has(key)) continue

        threads.set(key, {
          key,
          customerId: message.customerId,
          name: message.customer?.name ?? phone,
          phone,
          lastMessage: message.body ?? (message.mediaType ? `[${message.mediaType}]` : ''),
          lastDirection: message.direction,
          lastAt: message.createdAt,
          unread: message.direction === 'inbound',
        })
      }

      return Array.from(threads.values()).slice(0, limit)
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function deleteWhatsappMessage(messageId: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const message = await db.whatsappMessage.findFirst({
        where: { id: messageId, organizationId },
        select: { id: true },
      })
      if (!message) throw new Error('Message not found')

      // Deleting here only clears our copy: WhatsApp itself keeps what was
      // already delivered to the customer's phone.
      await db.whatsappMessage.delete({ where: { id: message.id } })
      return { deleted: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
