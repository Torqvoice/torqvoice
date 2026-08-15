/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString) */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Where an event points: the quote itself, otherwise the vehicle it belongs to */
export function getEventLink(event: {
  id: string;
  type: "service" | "reminder" | "quote";
  vehicleId: string | null;
}): string {
  if (event.type === "quote") return `/quotes/${event.id}`;
  if (!event.vehicleId) return event.type === "reminder" ? "/reminders" : `/sales/${event.id}`;
  return `/vehicles/${event.vehicleId}`;
}

export function formatDateHeader(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
