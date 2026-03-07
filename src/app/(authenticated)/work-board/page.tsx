import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getTechnicians } from "@/features/workboard/Actions/technicianActions";
import { getBoardJobs, getUnassignedJobs, getWorkBoardSettings } from "@/features/workboard/Actions/boardActions";
import { WorkBoardClient } from "@/features/workboard/Components/WorkBoardClient";

function getWeekStart(date: Date, weekStartDay: number): string {
  const d = new Date(date);
  const currentDay = d.getDay();
  const diff = (currentDay - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default async function WorkBoardPage() {
  const settingsResult = await getWorkBoardSettings();
  const boardSettings = settingsResult.success && settingsResult.data
    ? settingsResult.data
    : { weekStartDay: 1, workDayStart: "07:00", workDayEnd: "15:00" };

  const weekStart = getWeekStart(new Date(), boardSettings.weekStartDay);

  const [techResult, assignResult, unassignedResult] = await Promise.all([
    getTechnicians(),
    getBoardJobs(weekStart),
    getUnassignedJobs(),
  ]);

  if (!techResult.success) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {techResult.error || (await getTranslations("workBoard.page"))("error")}
          </p>
        </div>
      </>
    );
  }

  const technicians = techResult.data ?? [];
  const assignments = assignResult.success && assignResult.data ? assignResult.data : [];
  const unassigned = unassignedResult.success && unassignedResult.data
    ? unassignedResult.data
    : { serviceRecords: [], inspections: [] };

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <WorkBoardClient
          initialTechnicians={technicians as Parameters<typeof WorkBoardClient>[0]["initialTechnicians"]}
          initialAssignments={assignments as Parameters<typeof WorkBoardClient>[0]["initialAssignments"]}
          initialUnassigned={unassigned}
          initialWeekStart={weekStart}
          boardSettings={boardSettings}
        />
      </div>
    </>
  );
}
