'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuard } from '@/lib/demo'
import { MESSAGE_CHANNELS } from '@/features/scheduled-messages/Schema/scheduledMessageSchema'
import { dispatchScheduledMessage } from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import { TIRE_MESSAGE_REASONS } from '../Lib/messageTemplates'
import { requireTireHotel } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]

const messageSchema = z
  .object({
    tireSetId: z.string().min(1),
    channel: z.enum(MESSAGE_CHANNELS),
    subject: z.string().max(200).optional().or(z.literal('')),
    body: z.string().trim().min(1, 'Write a message first').max(4000),
    /// Overrides the address on file, for a customer reachable somewhere else.
    recipient: z.string().max(320).optional().or(z.literal('')),
    reason: z.enum(TIRE_MESSAGE_REASONS).default('custom'),
  })
  .refine((v) => v.channel !== 'email' || !!v.subject?.trim(), {
    message: 'Subject is required for email',
    path: ['subject'],
  })

/// The channels this composer offers, in the order the picker shows them.
const CUSTOMER_CHANNELS = ['email', 'sms', 'telegram'] as const

/**
 * What the composer needs to open: who the customer is, how they can be
 * reached, and which of those the workshop has actually configured.
 *
 * A channel the shop has not set up and a channel this customer has no
 * address for are different problems, so both are reported rather than
 * collapsed into one empty list.
 */
export async function getMessageContext(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const set = await db.tireSet.findFirst({
        where: { id: tireSetId, organizationId },
        select: {
          id: true,
          reference: true,
          season: true,
          size: true,
          location: { select: { code: true } },
          customer: {
            select: { id: true, name: true, email: true, phone: true, telegramChatId: true },
          },
          vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
        },
      })
      if (!set) throw new Error('Tire set not found')

      const [available, org] = await Promise.all([
        getAvailableChannels(organizationId),
        db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      ])

      const customer = set.customer
      // Every channel that can reach a customer is listed, including the ones
      // this workshop has not set up. Hiding SMS from a shop that never
      // configured a provider reads as the feature not existing; showing it
      // greyed out with a pointer to settings reads as a switch to flip.
      //
      // in_app notifies the workshop, not the customer, so it stays out: this
      // composer exists to reach the person who owns the tires.
      const channels = CUSTOMER_CHANNELS.map((channel) => ({
        channel,
        configured: available.includes(channel),
        reachable:
          channel === 'email'
            ? !!customer?.email
            : channel === 'sms'
              ? !!customer?.phone
              : !!customer?.telegramChatId,
      }))

      return {
        tireSetId: set.id,
        reference: set.reference,
        season: set.season,
        size: set.size,
        shelf: set.location?.code ?? null,
        shopName: org?.name ?? '',
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              hasTelegram: !!customer.telegramChatId,
            }
          : null,
        vehicle: set.vehicle,
        channels,
      }
    },
    { requiredPermissions: READ }
  )
}

/**
 * Sends the message and records it.
 *
 * Goes through the scheduled-message table even though it is sent
 * immediately, so it lands in the customer's conversation and the messages
 * page alongside everything else the workshop has said to them. A message
 * that only existed as a side effect would be invisible the moment the
 * customer rang back about it.
 */
export async function messageCustomerAboutTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      await requireTireHotel(organizationId)
      const data = messageSchema.parse(input)

      const set = await db.tireSet.findFirst({
        where: { id: data.tireSetId, organizationId },
        select: {
          id: true,
          reference: true,
          customerId: true,
          vehicleId: true,
          customer: { select: { email: true, phone: true, telegramChatId: true } },
        },
      })
      if (!set) throw new Error('Tire set not found')

      // The picker greys out channels the shop has not set up, so this only
      // catches a request that skipped it. Better to refuse than to file a
      // message that was never going to leave the building.
      const configured = await getAvailableChannels(organizationId)
      if (!configured.includes(data.channel)) {
        throw new Error('That channel is not set up for this workshop')
      }

      const override = data.recipient?.trim()
      const onFile =
        data.channel === 'email'
          ? set.customer?.email
          : data.channel === 'sms'
            ? set.customer?.phone
            : set.customer?.telegramChatId
      if (!override && !onFile) {
        throw new Error('This customer has no address on file for that channel')
      }

      const record = await db.scheduledMessage.create({
        data: {
          channel: data.channel,
          subject: data.subject?.trim() || null,
          body: data.body.trim(),
          recipient: override || null,
          customerId: set.customerId,
          vehicleId: set.vehicleId,
          sendAt: new Date(),
          frequency: 'once',
          organizationId,
          createdById: userId,
        },
      })

      const now = new Date()
      try {
        await dispatchScheduledMessage(record)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        // The row stays as the record of an attempt: a failed send the
        // workshop cannot see is worse than none at all.
        await db.scheduledMessage.update({
          where: { id: record.id },
          data: { status: 'failed', lastRunAt: now, errorMessage: message },
        })
        throw error
      }

      await db.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'sent', sentAt: now, lastRunAt: now, runCount: 1, errorMessage: null },
      })

      revalidatePath(`/tire-hotel/${set.id}`)
      revalidatePath('/messages')
      return {
        id: record.id,
        channel: data.channel,
        reason: data.reason,
        tireSetId: set.id,
        reference: set.reference,
      }
    },
    {
      requiredPermissions: READ,
      audit: ({ result }) => ({
        action: 'tire_set.message_customer',
        entity: 'ScheduledMessage',
        entityId: result.id,
        details: {
          key: 'tire_set_message_customer',
          params: { ref: result.reference ?? result.tireSetId, channel: result.channel },
        },
        metadata: { reason: result.reason, channel: result.channel },
      }),
    }
  )
}
