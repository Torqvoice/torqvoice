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

            case "technician_created":
              store.addTechnician(data.technician);
              break;

            case "technician_updated":
            case "technician_removed":
              // Reload full technician list for updates/removals
              import("../Actions/technicianActions").then(({ getTechnicians }) => {
                getTechnicians().then((res) => {
                  if (res.success && res.data) {
                    store.setTechnicians(res.data as Parameters<typeof store.setTechnicians>[0]);
                  }
                });
              });
              break;

            case "job_status_changed": {
              const { serviceRecordId, inspectionId, status, serviceRecord } = data;
              const activeStatuses = ["pending", "in-progress", "waiting-parts", "scheduled"];

              // Update the status on matching assignments in-place
              const updated = store.assignments.map((a) => {
                if (serviceRecordId && a.serviceRecordId === serviceRecordId && a.serviceRecord) {
                  return { ...a, serviceRecord: { ...a.serviceRecord, status } };
                }
                if (inspectionId && a.inspectionId === inspectionId && a.inspection) {
                  return { ...a, inspection: { ...a.inspection, status } };
                }
                return a;
              });
              store.setAssignments(updated);

              // Add/remove from unassigned pool for service records
              if (serviceRecordId && serviceRecord) {
                const isAssigned = store.assignments.some(
                  (a) => a.serviceRecordId === serviceRecordId,
                );
                const isAlreadyUnassigned = store.unassignedServiceRecords.some(
                  (sr) => sr.id === serviceRecordId,
                );

                if (activeStatuses.includes(status) && !isAssigned && !isAlreadyUnassigned) {
                  store.addToUnassigned(serviceRecord, "serviceRecord");
                } else if (!activeStatuses.includes(status)) {
                  store.removeFromUnassigned(serviceRecordId, "serviceRecord");
                }
              }
              break;
            }
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
