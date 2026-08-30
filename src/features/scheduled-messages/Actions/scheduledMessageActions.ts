'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuard } from '@/lib/demo'
import {
  createScheduledMessageSchema,
  updateScheduledMessageSchema,
} from '../Schema/scheduledMessageSchema'
import { dispatchScheduledMessage, nextSendAt } from '../Lib/dispatchScheduledMessage'

export type ScheduledMessageListItem = {
  id: string
  channel: string
  subject: string | null
  body: string
  recipient: string | null
  status: string
  sendAt: Date
  frequency: string
  endDate: Date | null
  sentAt: Date | null
  runCount: number
  errorMessage: string | null
  customer: { id: string; name: string } | null
  vehicle: { id: string; make: string; model: string; year: number } | null
}

const listSelect = {
  id: true,
  channel: true,
  subject: true,
  body: true,
  recipient: true,
  status: true,
  sendAt: true,
  frequency: true,
  endDate: true,
  sentAt: true,
  runCount: true,
  errorMessage: true,
  customer: { select: { id: true, name: true } },
  vehicle: { select: { id: true, make: true, model: true, year: true } },
} as const

/**
 * Parse the local wall-clock the workshop typed ("2026-08-20T09:00") as local
 * time, never UTC, so the message goes out at the hour they see on screen.
 */
function parseLocalDateTime(value: string): Date {
  const normalized = /\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid send time')
  return date
}

export async function getScheduledMessages(params?: { status?: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const messages = await db.scheduledMessage.findMany({
        where: {
          organizationId,
          ...(params?.status ? { status: params.status } : {}),
        },
        select: listSelect,
        orderBy: [{ status: 'asc' }, { sendAt: 'asc' }],
        take: 500,
      })
      return messages as ScheduledMessageListItem[]
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/** Everything queued or already sent inside a date window, for the calendar. */
export async function getScheduledMessagesInRange(params: { start: string; end: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(params.start)
      const end = new Date(params.end)
      end.setHours(23, 59, 59, 999)

      return db.scheduledMessage.findMany({
        where: {
          organizationId,
          status: { not: 'cancelled' },
          sendAt: { gte: start, lte: end },
        },
        select: listSelect,
        orderBy: { sendAt: 'asc' },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function createScheduledMessage(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const data = createScheduledMessageSchema.parse(input)
      const sendAt = parseLocalDateTime(data.sendAt)

      if (data.customerId) {
        const customer = await db.customer.findFirst({
          where: { id: data.customerId, organizationId },
          select: { id: true },
        })
        if (!customer) throw new Error('Customer not found')
      }
      if (data.vehicleId) {
        const vehicle = await db.vehicle.findFirst({
          where: { id: data.vehicleId, organizationId },
          select: { id: true },
        })
        if (!vehicle) throw new Error('Vehicle not found')
      }

      const message = await db.scheduledMessage.create({
        data: {
          channel: data.channel,
          subject: data.subject?.trim() || null,
          body: data.body,
          recipient: data.recipient?.trim() || null,
          customerId: data.customerId || null,
          vehicleId: data.vehicleId || null,
          sendAt,
          frequency: data.frequency,
          endDate: data.endDate ? parseLocalDateTime(data.endDate) : null,
          organizationId,
          createdById: userId,
        },
      })

      revalidatePath('/messages')
      revalidatePath('/calendar')
      return message
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'scheduled_message.create',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: {
          key: 'scheduled_message_create',
          params: { channel: result.channel, sendAt: result.sendAt.toISOString() },
        },
        metadata: { channel: result.channel, frequency: result.frequency },
      }),
    }
  )
}

export async function updateScheduledMessage(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = updateScheduledMessageSchema.parse(input)

      const existing = await db.scheduledMessage.findFirst({
        where: { id: data.id, organizationId },
        select: { id: true },
      })
      if (!existing) throw new Error('Scheduled message not found')

      const message = await db.scheduledMessage.update({
        where: { id: data.id },
        data: {
          ...(data.channel ? { channel: data.channel } : {}),
          ...(data.subject !== undefined ? { subject: data.subject?.trim() || null } : {}),
          ...(data.body ? { body: data.body } : {}),
          ...(data.recipient !== undefined ? { recipient: data.recipient?.trim() || null } : {}),
          ...(data.customerId !== undefined ? { customerId: data.customerId || null } : {}),
          ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId || null } : {}),
          ...(data.sendAt ? { sendAt: parseLocalDateTime(data.sendAt) } : {}),
          ...(data.frequency ? { frequency: data.frequency } : {}),
          ...(data.endDate !== undefined
            ? { endDate: data.endDate ? parseLocalDateTime(data.endDate) : null }
            : {}),
          ...(data.status ? { status: data.status } : {}),
          // Rescheduling clears the last failure, so a fixed address doesn't
          // keep showing the error that has already been dealt with
          ...(data.sendAt || data.status === 'scheduled' ? { errorMessage: null } : {}),
        },
      })

      revalidatePath('/messages')
      revalidatePath('/calendar')
      return message
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'scheduled_message.update',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: { key: 'scheduled_message_update', params: { channel: result.channel } },
      }),
    }
  )
}

/** Stops a message without losing the record of it. */
export async function cancelScheduledMessage(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const existing = await db.scheduledMessage.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!existing) throw new Error('Scheduled message not found')

      const message = await db.scheduledMessage.update({
        where: { id },
        data: { status: 'cancelled' },
      })

      revalidatePath('/messages')
      revalidatePath('/calendar')
      return message
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'scheduled_message.cancel',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: { key: 'scheduled_message_cancel' },
      }),
    }
  )
}

export async function deleteScheduledMessage(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const existing = await db.scheduledMessage.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!existing) throw new Error('Scheduled message not found')

      await db.scheduledMessage.delete({ where: { id } })

      revalidatePath('/messages')
      revalidatePath('/calendar')
      return { id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'scheduled_message.delete',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: { key: 'scheduled_message_delete' },
      }),
    }
  )
}

/** Sends now, ahead of schedule. A repeating message keeps its next slot. */
export async function sendScheduledMessageNow(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const message = await db.scheduledMessage.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          channel: true,
          subject: true,
          body: true,
          recipient: true,
          organizationId: true,
          customerId: true,
          vehicleId: true,
          sendAt: true,
          frequency: true,
          endDate: true,
          runCount: true,
        },
      })
      if (!message) throw new Error('Scheduled message not found')

      const now = new Date()
      const following = nextSendAt(message.sendAt, message.frequency, message.endDate)

      try {
        await dispatchScheduledMessage(message)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await db.scheduledMessage.update({
          where: { id },
          data: { lastRunAt: now, errorMessage },
        })
        throw error
      }

      const updated = await db.scheduledMessage.update({
        where: { id },
        data: {
          status: following ? 'scheduled' : 'sent',
          sendAt: following ?? message.sendAt,
          sentAt: now,
          lastRunAt: now,
          runCount: message.runCount + 1,
          errorMessage: null,
        },
      })

      revalidatePath('/messages')
      revalidatePath('/calendar')
      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'scheduled_message.send_now',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: { key: 'scheduled_message_send_now', params: { channel: result.channel } },
      }),
    }
  )
}
