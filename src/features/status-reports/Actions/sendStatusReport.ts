'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getTranslations } from 'next-intl/server'
import { sendStatusReportSchema } from '../Schema/statusReportSchema'
import { sendSmsToCustomer } from '@/features/sms/Actions/smsActions'
import { sendNotificationEmail } from '@/features/email/Actions/emailActions'
import { sendTelegramToCustomer } from '@/features/telegram/Actions/telegramActions'
import { demoGuard } from '@/lib/demo'

export async function sendStatusReport(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const data = sendStatusReportSchema.parse(input)

      // Get the status report with service record and customer info
      const report = await db.statusReport.findFirst({
        where: { id: data.statusReportId, organizationId },
        include: {
          serviceRecord: {
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  telegramChatId: true,
                },
              },
              vehicle: {
                include: {
                  customer: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      phone: true,
                      telegramChatId: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (!report) throw new Error('Status report not found')

      const customer = report.serviceRecord.customer ?? report.serviceRecord.vehicle?.customer
      if (!customer) throw new Error('No customer linked to this vehicle')

      // Build the public URL for the status report
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const publicUrl = `${appUrl}/share/status-report/${organizationId}/${report.publicToken}`

      const vehicle = report.serviceRecord.vehicle
      const vehicleName = vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : report.serviceRecord.title

      const t = await getTranslations('statusReport.notify')
      const messageBody = data.customMessage
        ? `${data.customMessage}\n\n${t('viewReport', { url: publicUrl })}`
        : t('defaultMessage', { name: customer.name, vehicle: vehicleName, url: publicUrl })

      const sentChannels: string[] = []
      const failures: { channel: string; error: string }[] = []

      /**
       * Records a channel as sent only if it was.
       *
       * The three senders are withAuth actions, so a refusal comes back as
       * `{ success: false }` rather than as a thrown error. Nothing here used
       * to read that, so a text message the provider rejected still counted,
       * and the report was filed as sent over a channel that sent nothing.
       *
       * A missing address counts as a failure too. Someone ticked the box, and
       * silently doing nothing is the same lie in a quieter voice.
       */
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
        if (result.success) sentChannels.push(channel)
        else failures.push({ channel, error: result.error ?? 'send failed' })
      }

      if (data.channels.email) {
        await attempt('email', customer.email, () =>
          sendNotificationEmail({
            recipientEmail: customer.email as string,
            subject: t('emailSubject', { vehicle: vehicleName }),
            body: messageBody,
          })
        )
      }

      if (data.channels.sms) {
        await attempt('sms', customer.phone, () =>
          sendSmsToCustomer({
            customerId: customer.id,
            body: messageBody,
            relatedEntityType: 'status_report',
            relatedEntityId: report.id,
          })
        )
      }

      if (data.channels.telegram) {
        await attempt('telegram', customer.telegramChatId, () =>
          sendTelegramToCustomer({
            customerId: customer.id,
            body: messageBody,
            relatedEntityType: 'status_report',
            relatedEntityId: report.id,
          })
        )
      }

      // Nothing left the building, so nothing is recorded and the caller hears
      // about it. Marking a report sent when every channel failed is the
      // failure this whole function exists to avoid.
      if (sentChannels.length === 0) {
        throw new Error(
          failures.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'No channel to send on'
        )
      }

      // Only the channels that actually carried it. A partial send is still a
      // send, and the row should say which half worked.
      await db.statusReport.update({
        where: { id: report.id },
        data: {
          status: 'sent',
          sentVia: sentChannels.join(','),
          sentAt: new Date(),
        },
      })

      return {
        sent: true,
        channels: sentChannels,
        failures,
        statusReportId: data.statusReportId,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'statusReport.send',
        entity: 'StatusReport',
        entityId: result.statusReportId,
        details: { key: 'statusReport_send', params: { channels: result.channels.join(', ') } },
      }),
    }
  )
}
