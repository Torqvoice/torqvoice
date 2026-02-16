import { getCalendarEvents } from "@/features/calendar/Actions/calendarActions";
import { PageHeader } from "@/components/page-header";
import CalendarClient from "@/features/calendar/Components/CalendarClient";

export default async function CalendarPage() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const result = await getCalendarEvents({
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  });

  const events = result.success && result.data ? result.data : [];

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CalendarClient
          initialEvents={events}
          initialMonth={now.getMonth()}
          initialYear={now.getFullYear()}
        />
      </div>
    </>
  );
}
