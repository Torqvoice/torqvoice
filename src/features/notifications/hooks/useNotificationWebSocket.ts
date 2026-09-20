'use client'

import { useEffect } from 'react'
import { useRealtime, useRealtimeState } from '@/features/realtime/RealtimeProvider'
import { toast } from 'sonner'
import { useNotificationStore, type Notification } from '../store/notificationStore'
import { getNotifications, markNotificationRead } from '../Actions/notificationActions'
import { getActiveSmsCustomerId } from '@/features/sms/activeSmsView'

export function useNotificationWebSocket() {
  const realtime = useRealtime()
  const { status } = useRealtimeState()

  useEffect(() => {
    useNotificationStore.getState().setConnected(status === 'ready')
    return () => useNotificationStore.getState().setConnected(false)
  }, [status])

  useEffect(() => {
    // Liveness is a per-effect-run closure, not a shared ref: with a ref, a
    // remount (StrictMode does this on every mount in dev) let the *old*
    // socket's async onclose observe the *new* run's "mounted" state and
    // schedule a reconnect — leaving two live sockets delivering every
    // notification twice.
    let alive = true

    // Fetch initial notifications
    getNotifications().then((result) => {
      if (!alive) return
      if (result.success && result.data) {
        useNotificationStore
          .getState()
          .setNotifications(result.data.notifications, result.data.unreadCount)
      }
    })

    return () => {
      alive = false
    }
  }, [])

  // The workshop's feed, on the app's one socket. The server only sends it to
  // the roles that may read it (lib/notification-roles), so nothing here has
  // to filter by role.
  useEffect(() => {
    if (!realtime) return
    return realtime.onLegacy('notification', (raw) => {
      const data = raw as Notification
      if (!data?.id) return

      // Already looking at this conversation: file it read, and stay quiet.
      const activeSmsCid = getActiveSmsCustomerId()
      if (
        activeSmsCid &&
        data.type === 'sms_inbound' &&
        data.entityUrl === `/messages?customerId=${activeSmsCid}`
      ) {
        useNotificationStore.getState().addNotification({ ...data, read: true })
        useNotificationStore.setState((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) }))
        markNotificationRead(data.id)
        return
      }

      useNotificationStore.getState().addNotification(data)
      const isSms = data.type === 'sms_inbound'
      toast(data.title, {
        description: data.message,
        ...(isSms && { duration: 5 * 60 * 1000 }),
        action: {
          label: 'View',
          onClick: () => {
            window.location.href = data.entityUrl
          },
        },
      })
    })
  }, [realtime])
}
