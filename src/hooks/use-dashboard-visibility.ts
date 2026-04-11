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
  "recentObservations",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

const STORAGE_KEY = "torqvoice-dashboard-hidden";

export function useDashboardVisibility(excludeId?: DashboardCardId) {
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

  const applicableIds = excludeId
    ? DASHBOARD_CARD_IDS.filter((id) => id !== excludeId)
    : DASHBOARD_CARD_IDS;
  const visibleCount = applicableIds.filter((id) => !hidden.has(id)).length;
  const totalCount = applicableIds.length;

  return { toggleCard, isVisible, visibleCount, totalCount };
}
