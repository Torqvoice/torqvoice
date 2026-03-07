import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getTechnicians } from "@/features/workboard/Actions/technicianActions";
import { getBoardAssignments, getWorkBoardSettings } from "@/features/workboard/Actions/boardActions";
import { WorkBoardPresenter } from "@/features/workboard/Components/WorkBoardPresenter";

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default async function WorkBoardPresenterPage() {
  const weekStart = getMonday(new Date());

  const [techResult, assignResult, settingsResult] = await Promise.all([
    getTechnicians(),
    getBoardAssignments(weekStart),
    getWorkBoardSettings(),
  ]);

  const boardSettings = settingsResult.success && settingsResult.data
    ? settingsResult.data
    : { weekStartDay: 1, workDayStart: "07:00", workDayEnd: "15:00" };

  if (!techResult.success) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-lg">
          {techResult.error || (await getTranslations("workBoard.page"))("error")}
        </p>
      </div>
    );
  }

  const technicians = techResult.data ?? [];
  const assignments =
    assignResult.success && assignResult.data ? assignResult.data : [];

  return (
    <Suspense>
      <WorkBoardPresenter
        initialTechnicians={
          technicians as Parameters<typeof WorkBoardPresenter>[0]["initialTechnicians"]
        }
        initialAssignments={
          assignments as Parameters<typeof WorkBoardPresenter>[0]["initialAssignments"]
        }
        initialWeekStart={weekStart}
        workDayStart={boardSettings.workDayStart}
        workDayEnd={boardSettings.workDayEnd}
      />
    </Suspense>
  );
}
