"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNotificationStore } from "../store/notificationStore";
import { getNotifications } from "../Actions/notificationActions";

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
      console.log("[WS] Connecting to", url);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
        useNotificationStore.getState().setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("[WS] Message:", msg.type);
          if (msg.type === "notification") {
            useNotificationStore.getState().addNotification(msg.data);
            toast(msg.data.title, {
              description: msg.data.message,
              action: {
                label: "View",
                onClick: () => {
                  window.location.href = msg.data.entityUrl;
                },
              },
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = (e) => {
        console.log("[WS] Closed:", e.code, e.reason);
        useNotificationStore.getState().setConnected(false);
        wsRef.current = null;
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        console.log("[WS] Error — closing");
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
