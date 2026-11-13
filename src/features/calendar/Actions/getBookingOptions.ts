'use server'

import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getManifest } from '@/integrations/registry'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import type { NotificationChannel } from '../Schema/bookingSchema'

export interface BookingOptions {
  /** Ways a notification can go out in this workshop. */
  channels: NotificationChannel[]
  /** Connected services that can add a video call to a booked job. */
  video: { connectorId: string; name: string }[]
}

/**
 * What the booking dialog can offer in this workshop: the customer channels
 * it has set up, and the video call services it has connected. Nothing is
 * offered that would fail when the time comes.
 */
export async function getBookingOptions() {
  return withAuth(
    async ({ organizationId }): Promise<BookingOptions> => {
      const [available, connections] = await Promise.all([
        getAvailableChannels(organizationId),
        db.integrationConnection.findMany({
          where: { organizationId, status: 'active' },
          select: { connectorId: true },
        }),
      ])
      const channels: NotificationChannel[] = ['in_app', 'email']
      if (available.includes('sms')) channels.push('customer_sms')
      if (available.includes('email')) channels.push('customer_email')

      const ti = await getTranslations('integrations')
      const video = connections
        .map((c) => getManifest(c.connectorId))
        .filter((m) => Boolean(m?.meetingProvider))
        .map((m) => ({ connectorId: m!.id, name: connectorName(ti, m!) }))
      return { channels, video }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
