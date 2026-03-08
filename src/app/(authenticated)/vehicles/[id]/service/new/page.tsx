import { redirect } from "next/navigation";
import { createDraftServiceRecord } from "@/features/vehicles/Actions/createDraftServiceRecord";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export default async function NewServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  // Guard: if a pending draft already exists for this vehicle (created within the last 5 seconds),
  // reuse it instead of creating a duplicate. This prevents double-creation from
  // Next.js Server Component re-renders.
  const existingResult = await withAuth(
    async ({ organizationId }) => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      return db.serviceRecord.findFirst({
        where: {
          vehicleId: id,
          vehicle: { organizationId },
          status: "pending",
          title: "New Service Record",
          createdAt: { gte: fiveSecondsAgo },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
    },
  );

  if (existingResult.success && existingResult.data?.id) {
    redirect(`/vehicles/${id}/service/${existingResult.data.id}`);
  }

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

  const boardTechId = query.boardTech;
  const result = await createDraftServiceRecord(id, startDateTime, endDateTime, boardTechId);

  if (result.success && result.data?.id) {
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
