export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1439, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getResolvedRange(
  startDateTime: string | null | undefined,
  endDateTime: string | null | undefined,
  dayStartMins: number,
): { startMins: number; endMins: number; isUnscheduled: boolean } {
  if (startDateTime && endDateTime) {
    const s = new Date(startDateTime);
    const e = new Date(endDateTime);
    return {
      startMins: s.getHours() * 60 + s.getMinutes(),
      endMins: e.getHours() * 60 + e.getMinutes(),
      isUnscheduled: false,
    };
  }
  return { startMins: dayStartMins, endMins: dayStartMins + 60, isUnscheduled: true };
}

export const BAR_COLORS = [
  "bg-sky-400/80 text-sky-950 dark:bg-sky-600/80 dark:text-sky-50",
  "bg-emerald-400/80 text-emerald-950 dark:bg-emerald-600/80 dark:text-emerald-50",
  "bg-amber-400/80 text-amber-950 dark:bg-amber-600/80 dark:text-amber-50",
  "bg-violet-400/80 text-violet-950 dark:bg-violet-600/80 dark:text-violet-50",
  "bg-rose-400/80 text-rose-950 dark:bg-rose-600/80 dark:text-rose-50",
  "bg-cyan-400/80 text-cyan-950 dark:bg-cyan-600/80 dark:text-cyan-50",
  "bg-lime-400/80 text-lime-950 dark:bg-lime-600/80 dark:text-lime-50",
  "bg-orange-400/80 text-orange-950 dark:bg-orange-600/80 dark:text-orange-50",
];
