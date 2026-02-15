import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { redirect } from "next/navigation";
import { ServiceVideoManager } from "@/features/vehicles/Components/service-video-manager";

export default async function EditServiceVideoPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;

  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/sign-in");
  const membership = await getCachedMembership(session.user.id);
  if (!membership) redirect("/sign-in");

  const record = await db.serviceRecord.findFirst({
    where: {
      id: serviceId,
      vehicle: { id, organizationId: membership.organizationId },
    },
    select: {
      id: true,
      attachments: {
        where: { category: "video" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!record) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Service record not found</p>
      </div>
    );
  }

  return (
    <ServiceVideoManager
      serviceRecordId={record.id}
      initialVideos={record.attachments}
    />
  );
}
