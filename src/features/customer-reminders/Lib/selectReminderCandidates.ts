/**
 * Pure candidate selection for customer reminders: which vehicles get an
 * "inspection due" message and how each due occurrence is keyed for the
 * dedupe ledger. Kept free of database access so it is directly testable.
 */

export const DEFAULT_INSPECTION_LEAD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One occurrence key per inspection due date: "2026-09-14". */
export function buildInspectionDueKey(dueDate: Date): string {
  return dueDate.toISOString().slice(0, 10);
}

/**
 * One occurrence key per prediction month: "2026-08". A vehicle that stays
 * overdue is re-reminded at most once per calendar month until it comes in
 * for service (which resets the prediction itself).
 */
export function buildServiceDueKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export type InspectionRow = {
  vehicleId: string;
  nextTestDue: Date | null;
  createdAt: Date;
};

/**
 * Reduces an inspection list (sorted newest first) to the latest inspection
 * per vehicle, then keeps the ones whose next test falls inside the reminder
 * window: from the start of today (UTC) to `leadDays` days ahead. Only the
 * latest inspection counts; an older certificate must not trigger a reminder
 * when a newer one already pushed the due date out.
 */
export function selectInspectionsDue<T extends InspectionRow>(
  inspectionsNewestFirst: T[],
  now: Date,
  leadDays: number,
): T[] {
  const latestPerVehicle = new Map<string, T>();
  for (const inspection of inspectionsNewestFirst) {
    if (!latestPerVehicle.has(inspection.vehicleId)) {
      latestPerVehicle.set(inspection.vehicleId, inspection);
    }
  }

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(now.getTime() + leadDays * DAY_MS);

  const due: T[] = [];
  for (const inspection of latestPerVehicle.values()) {
    const dueDate = inspection.nextTestDue;
    if (!dueDate) continue;
    if (dueDate < startOfToday || dueDate > windowEnd) continue;
    due.push(inspection);
  }
  return due;
}

/** Builds the dedupe set key used against CustomerReminderLog rows. */
export function reminderLogKey(vehicleId: string, type: string, dueKey: string): string {
  return `${vehicleId}|${type}|${dueKey}`;
}
