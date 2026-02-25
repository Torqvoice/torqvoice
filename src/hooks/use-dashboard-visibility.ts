"use client";

import { useState, useCallback } from "react";

export const DASHBOARD_CARD_IDS = [
  "maintenance",
  "reminders",
  "inspections",
  "quoteRequests",
  "quoteResponses",
  "sms",
  "notifications",
  "recentCompleted",
  "activeJobs",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

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
