"use client";

import { useState, useCallback } from "react";

export const DASHBOARD_CARDS = [
  { id: "maintenance", label: "Predicted Maintenance" },
  { id: "reminders", label: "Upcoming Reminders" },
  { id: "inspections", label: "Inspections" },
  { id: "quoteRequests", label: "Quote Requests" },
  { id: "quoteResponses", label: "Quote Responses" },
  { id: "sms", label: "Recent Messages" },
  { id: "notifications", label: "Recent Notifications" },
  { id: "recentCompleted", label: "Recent Completed" },
  { id: "activeJobs", label: "Active Jobs" },
] as const;

const STORAGE_KEY = "torqvoice-dashboard-hidden";

export function useDashboardVisibility() {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return new Set(JSON.parse(stored));
      } catch {
        // ignore malformed data
      }
    }
    return new Set();
  });

  const toggleCard = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isVisible = useCallback((id: string) => !hidden.has(id), [hidden]);

  return { toggleCard, isVisible };
}
