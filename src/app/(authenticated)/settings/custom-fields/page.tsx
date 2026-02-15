import { redirect } from "next/navigation";
import { getFieldDefinitions } from "@/features/custom-fields/Actions/customFieldActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { CustomFieldsManager } from "@/features/custom-fields/Components/CustomFieldsManager";

export default async function CustomFieldsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.customFields) {
    redirect("/settings");
  }

  const result = await getFieldDefinitions();
  const fields = result.success && result.data ? result.data : [];

  return <CustomFieldsManager initialFields={fields} />;
}
