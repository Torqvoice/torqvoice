'use client'

import { useNotificationWebSocket } from '../hooks/useNotificationWebSocket'
import { useUnreadTabTitle } from '../hooks/useUnreadTabTitle'

export function NotificationInitializer() {
  useNotificationWebSocket()
  useUnreadTabTitle()
  return null
}
