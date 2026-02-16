import { getCalendarEvents } from "@/features/calendar/Actions/calendarActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PageHeader } from "@/components/page-header";
import CalendarClient from "@/features/calendar/Components/CalendarClient";

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function CalendarPage() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [eventsResult, settingsResult, vehiclesResult] = await Promise.all([
    getCalendarEvents({
      start: toLocalDateStr(start),
      end: toLocalDateStr(end),
    }),
    getSettings([SETTING_KEYS.CURRENCY_CODE]),
    getVehicles(),
  ]);

  const events = eventsResult.success && eventsResult.data ? eventsResult.data : [];
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const vehicles = vehiclesResult.success && vehiclesResult.data
    ? vehiclesResult.data.map((v) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        licensePlate: v.licensePlate,
        customer: v.customer,
      }))
    : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CalendarClient
          initialEvents={events}
          initialMonth={now.getMonth()}
          initialYear={now.getFullYear()}
          initialDay={now.getDate()}
          todayStr={toLocalDateStr(now)}
          vehicles={vehicles}
          currencyCode={currencyCode}
        />
      </div>
    </>
  );
}
