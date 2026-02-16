"use client";

import { useDateSettings } from "@/components/date-settings-context";
import {
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
  formatTime as fmtTime,
} from "@/lib/format";

export function useFormatDate() {
  const { dateFormat, timeFormat, timezone } = useDateSettings();
  const tz = timezone || undefined;

  return {
    formatDate: (date: Date | string) => fmtDate(date, dateFormat, tz),
    formatDateTime: (date: Date | string) =>
      fmtDateTime(date, dateFormat, timeFormat, tz),
    formatTime: (date: Date | string) => fmtTime(date, timeFormat, tz),
  };
}
