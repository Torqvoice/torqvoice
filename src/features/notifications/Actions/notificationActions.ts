'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { readsNotifications } from '@/lib/notification-roles'

export async function getNotifications() {
  return withAuth(async ({ organizationId, role }) => {
    if (!readsNotifications(role)) return { notifications: [], unreadCount: 0 }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({
        where: { organizationId, read: false },
      }),
    ])

    return { notifications, unreadCount }
  })
}

export async function markNotificationRead(id: string) {
  return withAuth(async ({ organizationId }) => {
    await db.notification.updateMany({
      where: { id, organizationId },
      data: { read: true },
    })
    return { success: true }
  })
}

export async function markAllNotificationsRead() {
  return withAuth(async ({ organizationId }) => {
    await db.notification.updateMany({
      where: { organizationId, read: false },
      data: { read: true },
    })
    return { success: true }
  })
}

export async function deleteNotification(id: string) {
  return withAuth(async ({ organizationId, role }) => {
    if (!readsNotifications(role)) throw new Error(ONLY_FEED_READERS)
    await db.notification.deleteMany({
      where: { id, organizationId },
    })
    return { success: true }
  })
}

const ONLY_FEED_READERS = 'Only the roles that read the notification feed can delete from it'

/**
 * Empty the workshop's feed. `before` is the newest notification the person
 * was looking at when they confirmed: anything that arrived after that is
 * not something they chose to clear, so it stays, and the panel and the
 * database agree on what is left.
 */
export async function deleteAllNotifications(before: string) {
  return withAuth(async ({ organizationId, role }) => {
    if (!readsNotifications(role)) throw new Error(ONLY_FEED_READERS)
    const cutoff = new Date(before)
    if (Number.isNaN(cutoff.getTime())) throw new Error('Invalid cutoff')
    await db.notification.deleteMany({
      where: { organizationId, createdAt: { lte: cutoff } },
    })
    return { success: true }
  })
}
