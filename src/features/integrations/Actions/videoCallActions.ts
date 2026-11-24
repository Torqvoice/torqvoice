'use server'

import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { demoGuard } from '@/lib/demo'
import { formatDateTime } from '@/lib/format'
import { workshopDateSettings } from '@/lib/workshop-timezone'
import { sendSmsToCustomer } from '@/features/sms/Actions/smsActions'
import { sendNotificationEmail } from '@/features/email/Actions/emailActions'
import { sendTelegramToCustomer } from '@/features/telegram/Actions/telegramActions'
import { serviceVideoLink, videoCallMessage } from '../Lib/video-call'
import { vehicleName } from '@/lib/vehicle-name'

const sendVideoCallSchema = z.object({
  serviceRecordId: z.string(),
  channels: z.object({ sms: z.boolean(), email: z.boolean(), telegram: z.boolean() }),
  customMessage: z.string().max(2000).optional(),
})

const customerSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  telegramChatId: true,
} as const

/**
 * Send the work order's video call link to its customer, on the channels a
 * person ticked. Nothing about a meeting reaches the customer any other way:
 * creating one only puts the link on the work order, and this is the step
 * that turns it into an invitation, done on purpose, with the text in view.
 */
export async function sendServiceVideoCall(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = sendVideoCallSchema.parse(input)
      const record = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, organizationId },
        select: {
          id: true,
          title: true,
          startDateTime: true,
          customer: { select: customerSelect },
          vehicle: {
            select: {
              year: true,
              make: true,
              model: true,
              customer: { select: customerSelect },
            },
          },
        },
      })
      if (!record) throw new Error('Work order not found')
      const customer = record.customer ?? record.vehicle?.customer
      if (!customer) throw new Error('No customer on this work order')
      const link = await serviceVideoLink(organizationId, record.id)
      if (!link) throw new Error('No video call on this work order')

      const vehicle = record.vehicle ? `${vehicleName(record.vehicle)}` : record.title
      // What the customer receives is in the workshop's language, whatever
      // language the person sending it reads the app in.
      const locale = await resolveDocumentLocale(organizationId)
      const t = await getTranslations({ locale, namespace: 'service.videoCall.notify' })
      let when: string | null = null
      if (record.startDateTime) {
        // The customer reads the time on the workshop's clock, written the
        // way the workshop writes dates and times on everything it sends.
        const shop = await workshopDateSettings(organizationId)
        when = formatDateTime(
          record.startDateTime,
          shop.dateFormat,
          shop.timeFormat,
          shop.timeZone,
          locale
        )
      }
      const body = videoCallMessage({
        customMessage: data.customMessage,
        invitation: when
          ? t('invitation', { name: customer.name, vehicle, when, url: link.url })
          : t('invitationNoTime', { name: customer.name, vehicle, url: link.url }),
        joinLine: t('joinLine', { url: link.url }),
      })

      const sent: string[] = []
      const failures: { channel: string; error: string }[] = []
      // A ticked channel with nothing to send to is a failure the sender
      // should hear about, not a quiet no-op.
      const attempt = async (
        channel: string,
        address: string | null | undefined,
        send: () => Promise<{ success: boolean; error?: string }>
      ) => {
        if (!address) {
          failures.push({ channel, error: 'no address on file' })
          return
        }
        const result = await send()
        if (result.success) sent.push(channel)
        else failures.push({ channel, error: result.error ?? 'send failed' })
      }
      if (data.channels.email) {
        await attempt('email', customer.email, () =>
          sendNotificationEmail({
            recipientEmail: customer.email as string,
            subject: t('emailSubject', { vehicle }),
            body,
            customerName: customer.name,
            vehicle: record.vehicle
              ? {
                  year: record.vehicle.year,
                  make: record.vehicle.make,
                  model: record.vehicle.model,
                }
              : null,
          })
        )
      }
      if (data.channels.sms) {
        await attempt('sms', customer.phone, () =>
          sendSmsToCustomer({
            customerId: customer.id,
            body,
            relatedEntityType: 'service_record',
            relatedEntityId: record.id,
          })
        )
      }
      if (data.channels.telegram) {
        await attempt('telegram', customer.telegramChatId, () =>
          sendTelegramToCustomer({
            customerId: customer.id,
            body,
            relatedEntityType: 'service_record',
            relatedEntityId: record.id,
          })
        )
      }
      if (sent.length === 0) {
        throw new Error(
          failures.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'No channel to send on'
        )
      }
      return { serviceRecordId: record.id, channels: sent, failures }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.videoCall.send',
        entity: 'ServiceRecord',
        entityId: result.serviceRecordId,
        details: {
          key: 'service_videoCall_send',
          params: { channels: result.channels.join(', ') },
        },
      }),
    }
  )
}
