import { redirect } from "next/navigation";
import { createDraftServiceRecord } from "@/features/vehicles/Actions/createDraftServiceRecord";

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await createDraftServiceRecord(id);

  if (result.success && result.data?.id) {
    redirect(`/vehicles/${id}/service/${result.data.id}/edit`);
  }

  return (
    <div className="flex h-[50vh] items-center justify-center">
      <p className="text-muted-foreground">
        {result.error || "Failed to create service record"}
      </p>
    </div>
  );
}
