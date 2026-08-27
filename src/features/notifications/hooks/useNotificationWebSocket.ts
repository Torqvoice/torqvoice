'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useNotificationStore } from '../store/notificationStore'
import { getNotifications, markNotificationRead } from '../Actions/notificationActions'
import { getActiveSmsCustomerId } from '@/features/sms/activeSmsView'

export function useNotificationWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

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

    function connect() {
      if (!alive) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocol}//${window.location.host}/api/protected/ws`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        useNotificationStore.getState().setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'notification') {
            const data = msg.data

            // If user is already viewing SMS for this customer, auto-read and skip toast
            const activeSmsCid = getActiveSmsCustomerId()
            if (
              activeSmsCid &&
              data.type === 'sms_inbound' &&
              data.entityUrl === `/messages?customerId=${activeSmsCid}`
            ) {
              // Still add it to the store but immediately mark as read
              const added = { ...data, read: true }
              useNotificationStore.getState().addNotification(added)
              // Decrement the unread count that addNotification just bumped
              useNotificationStore.setState((s) => ({
                unreadCount: Math.max(0, s.unreadCount - 1),
              }))
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
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        useNotificationStore.getState().setConnected(false)
        wsRef.current = null
        if (alive) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // no deps — mount once
}
