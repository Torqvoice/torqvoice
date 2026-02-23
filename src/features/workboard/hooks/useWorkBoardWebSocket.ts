"use client";

import { useEffect, useRef } from "react";
import { useWorkBoardStore } from "../store/workboardStore";

export function useWorkBoardWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/api/protected/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        useWorkBoardStore.getState().setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "workboard") return;

          const store = useWorkBoardStore.getState();
          const data = msg.data;

          switch (data.type) {
            case "assignment_created":
              store.addAssignment(data.assignment);
              // Remove from unassigned lists
              if (data.assignment.serviceRecordId) {
                store.removeFromUnassigned(
                  data.assignment.serviceRecordId,
                  "serviceRecord",
                );
              }
              if (data.assignment.inspectionId) {
                store.removeFromUnassigned(
                  data.assignment.inspectionId,
                  "inspection",
                );
              }
              break;

            case "assignment_moved":
              store.updateAssignment(data.assignment);
              break;

            case "assignment_removed":
              store.removeAssignment(data.assignmentId);
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        useWorkBoardStore.getState().setConnected(false);
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
  }, []);
}
