import { getInspection } from "@/features/inspections/Actions/inspectionActions";
import { InspectionPageClient } from "@/features/inspections/Components/InspectionPageClient";
import { PageHeader } from "@/components/page-header";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getInspection(id);

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

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <InspectionPageClient inspection={result.data} />
      </div>
    </>
  );
}
