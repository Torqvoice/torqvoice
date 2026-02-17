import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EditNav } from "@/features/vehicles/Components/service-edit/EditNav";
import { EditActions } from "@/features/vehicles/Components/service-edit/EditActions";
import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { redirect } from "next/navigation";

export default async function EditServiceLayout({
  params,
  children,
}: {
  params: Promise<{ id: string; serviceId: string }>;
  children: React.ReactNode;
}) {
  const { id, serviceId } = await params;

  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/sign-in");
  const membership = await getCachedMembership(session.user.id);
  if (!membership) redirect("/sign-in");

  const vehicle = await db.vehicle.findFirst({
    where: { id, organizationId: membership.organizationId },
    select: { year: true, make: true, model: true },
  });

  const vehicleName = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : "Vehicle";

  return (
    <div className="flex h-svh flex-col">
      <PageHeader />
      <div className="shrink-0 border-b bg-background px-4 pt-2 pb-0">
        <div className="mb-2 flex items-center justify-between">
          <Link
            href={`/vehicles/${id}/service/${serviceId}`}
            className="flex items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Edit Service Record</h1>
              <p className="text-xs text-muted-foreground">{vehicleName}</p>
            </div>
          </Link>
          <EditActions serviceRecordId={serviceId} />
        </div>
        <EditNav vehicleId={id} serviceId={serviceId} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
