"use client";

import { useNotificationWebSocket } from "../hooks/useNotificationWebSocket";

export function NotificationInitializer() {
  useNotificationWebSocket();
  return null;
}
