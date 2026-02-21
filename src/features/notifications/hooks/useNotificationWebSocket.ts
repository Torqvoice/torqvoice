"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNotificationStore } from "../store/notificationStore";
import { getNotifications, markNotificationRead } from "../Actions/notificationActions";
import { getActiveSmsCustomerId } from "@/features/sms/activeSmsView";

export function useNotificationWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch initial notifications
    getNotifications().then((result) => {
      if (!mountedRef.current) return;
      if (result.success && result.data) {
        useNotificationStore.getState().setNotifications(
          result.data.notifications,
          result.data.unreadCount,
        );
      }
    });

    function connect() {
      if (!mountedRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/api/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        useNotificationStore.getState().setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "notification") {
            const data = msg.data;

            // If user is already viewing SMS for this customer, auto-read and skip toast
            const activeSmsCid = getActiveSmsCustomerId();
            if (
              activeSmsCid &&
              data.type === "sms_inbound" &&
              data.entityUrl === `/customers/${activeSmsCid}?tab=messages`
            ) {
              // Still add it to the store but immediately mark as read
              const added = { ...data, read: true };
              useNotificationStore.getState().addNotification(added);
              // Decrement the unread count that addNotification just bumped
              useNotificationStore.setState((s) => ({
                unreadCount: Math.max(0, s.unreadCount - 1),
              }));
              markNotificationRead(data.id);
              return;
            }

            useNotificationStore.getState().addNotification(data);
            toast(data.title, {
              description: data.message,
              action: {
                label: "View",
                onClick: () => {
                  window.location.href = data.entityUrl;
                },
              },
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        useNotificationStore.getState().setConnected(false);
        wsRef.current = null;
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []); // no deps — mount once
}
