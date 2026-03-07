/**
 * Shared datetime utilities for the work board feature.
 * All scheduling data uses full DateTime (startDateTime/endDateTime) on ServiceRecord/Inspection.
 */

import type { BoardAssignmentWithJob } from "../Actions/boardActions";

/** Convert a Date to "HH:MM" string */
export function getTimeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM" -> total minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Total minutes since midnight -> "HH:MM" (clamped 0-1439) */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1439, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Check if two Dates are on the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Check if [start, end) overlaps with [dayStart, dayEnd) */
export function dateOverlaps(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date,
): boolean {
  return start < dayEnd && end > dayStart;
}

/**
 * Clamp a [start, end) range to [dayStart, dayEnd).
 * Returns the visible portion within the day.
 */
export function clampToDay(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date,
): { start: Date; end: Date } {
  return {
    start: start < dayStart ? dayStart : start,
    end: end > dayEnd ? dayEnd : end,
  };
}

/** Extract startDateTime/endDateTime from an assignment's linked record */
export function getAssignmentDateRange(
  assignment: BoardAssignmentWithJob,
): { start: Date | null; end: Date | null } {
  const sr = assignment.serviceRecord;
  const insp = assignment.inspection;

  const startStr = sr?.startDateTime ?? insp?.startDateTime ?? null;
  const endStr = sr?.endDateTime ?? insp?.endDateTime ?? null;

  return {
    start: startStr ? new Date(startStr) : null,
    end: endStr ? new Date(endStr) : null,
  };
}

/** Get the duration in minutes between start and end */
export function getDurationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/** Check if an assignment overlaps with a given date string (YYYY-MM-DD) */
export function assignmentOverlapsDate(
  assignment: BoardAssignmentWithJob,
  dateStr: string,
): boolean {
  const { start, end } = getAssignmentDateRange(assignment);
  if (!start || !end) return false;

  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59.999");
  return dateOverlaps(start, end, dayStart, dayEnd);
}
