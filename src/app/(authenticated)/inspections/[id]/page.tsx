import { getInspection } from "@/features/inspections/Actions/inspectionActions";
import { InspectionPageClient, type InspectionData } from "@/features/inspections/Components/InspectionPageClient";
import { PageHeader } from "@/components/page-header";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [result, authContext] = await Promise.all([
    getInspection(id),
    getAuthContext(),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Inspection not found"}
          </p>
        </div>
      </>
    );
  }

  const features = authContext?.organizationId
    ? await getFeatures(authContext.organizationId)
    : null;

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <InspectionPageClient
          inspection={result.data as InspectionData}
          smsEnabled={features?.sms ?? false}
          emailEnabled={features?.smtp ?? false}
        />
      </div>
    </>
  );
}
