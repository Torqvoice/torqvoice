import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { redirect } from "next/navigation";
import { ServiceImagesManager } from "@/features/vehicles/Components/service-images-manager";
import { getFeatures } from "@/lib/features";

export default async function EditServiceImagesPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;

  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/sign-in");
  const membership = await getCachedMembership(session.user.id);
  if (!membership) redirect("/sign-in");

  const [record, features] = await Promise.all([
    db.serviceRecord.findFirst({
      where: {
        id: serviceId,
        vehicle: { id, organizationId: membership.organizationId },
      },
      select: {
        id: true,
        attachments: {
          where: { category: "image" },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    getFeatures(membership.organizationId),
  ]);

  if (!record) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Service record not found</p>
      </div>
    );
  }

  return (
    <ServiceImagesManager
      serviceRecordId={record.id}
      initialImages={record.attachments}
      maxImages={features.maxImagesPerService}
    />
  );
}
