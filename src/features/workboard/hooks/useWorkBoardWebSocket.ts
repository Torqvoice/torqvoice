"use client";

import { useEffect, useRef } from "react";
import { useWorkBoardStore } from "../store/workboardStore";
import type { WorkBoardJob } from "../Actions/boardActions";

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
            case "job_assigned":
              store.addJob(data.job as WorkBoardJob);
              // Remove from unassigned lists based on job type and id
              if (data.job.type === "serviceRecord") {
                store.removeFromUnassigned(data.job.id, "serviceRecord");
              } else if (data.job.type === "inspection") {
                store.removeFromUnassigned(data.job.id, "inspection");
              }
              break;

            case "job_moved":
              store.updateJob(data.job as WorkBoardJob);
              break;

            case "job_unassigned":
              store.removeJob(data.jobId);
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

            case "service_times_updated": {
              const { serviceRecordId, startDateTime, endDateTime } = data;
              const updatedJobs = store.jobs.map((j) =>
                j.type === "serviceRecord" && j.id === serviceRecordId
                  ? { ...j, startDateTime, endDateTime }
                  : j,
              );
              store.setJobs(updatedJobs);
              break;
            }

            case "inspection_times_updated": {
              const { inspectionId, startDateTime, endDateTime } = data;
              const updatedJobs = store.jobs.map((j) =>
                j.type === "inspection" && j.id === inspectionId
                  ? { ...j, startDateTime, endDateTime }
                  : j,
              );
              store.setJobs(updatedJobs);
              break;
            }

            case "job_status_changed": {
              const { serviceRecordId, inspectionId, status, serviceRecord } = data;
              const activeStatuses = ["pending", "in-progress", "waiting-parts", "scheduled"];

              // Update the status on matching jobs in-place
              const updated = store.jobs.map((j) => {
                if (serviceRecordId && j.type === "serviceRecord" && j.id === serviceRecordId) {
                  return { ...j, status };
                }
                if (inspectionId && j.type === "inspection" && j.id === inspectionId) {
                  return { ...j, status };
                }
                return j;
              });
              store.setJobs(updated);

              // Add/remove from unassigned pool for service records
              if (serviceRecordId && serviceRecord) {
                const isAssigned = store.jobs.some(
                  (j) => j.type === "serviceRecord" && j.id === serviceRecordId,
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
