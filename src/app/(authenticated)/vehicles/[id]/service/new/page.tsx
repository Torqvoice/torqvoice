import { redirect } from "next/navigation";
import { createDraftServiceRecord } from "@/features/vehicles/Actions/createDraftServiceRecord";
import { createBoardAssignment } from "@/features/workboard/Actions/boardActions";

export default async function NewServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  // If coming from work board context menu, use the provided date
  const boardDate = query.boardDate;
  const boardStart = query.boardStart;
  const boardEnd = query.boardEnd;

  // Build startDateTime/endDateTime from board context
  let startDateTime: Date | undefined;
  let endDateTime: Date | undefined;
  if (boardDate) {
    startDateTime = boardStart
      ? new Date(`${boardDate}T${boardStart}:00`)
      : new Date(`${boardDate}T08:00:00`);
    endDateTime = boardEnd
      ? new Date(`${boardDate}T${boardEnd}:00`)
      : new Date(startDateTime.getTime() + 3600000);
  }

  const result = await createDraftServiceRecord(id, startDateTime, endDateTime);

  if (result.success && result.data?.id) {
    const boardTechId = query.boardTech;

    if (boardTechId) {
      try {
        await createBoardAssignment({
          technicianId: boardTechId,
          serviceRecordId: result.data.id,
        });
      } catch {
        // Board assignment failed but service record was created
      }
    }

    redirect(`/vehicles/${id}/service/${result.data.id}`);
  }

  return (
    <div className="flex h-[50vh] items-center justify-center">
      <p className="text-muted-foreground">
        {result.error || "Failed to create service record"}
      </p>
    </div>
  );
}
