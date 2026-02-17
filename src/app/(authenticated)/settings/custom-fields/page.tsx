import { getFieldDefinitions } from "@/features/custom-fields/Actions/customFieldActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { CustomFieldsManager } from "@/features/custom-fields/Components/CustomFieldsManager";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function CustomFieldsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.customFields) {
    return (
      <FeatureLockedMessage
        feature="Custom Fields"
        description="Define custom data fields for vehicles, customers, and service records to track the information that matters to your shop."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getFieldDefinitions();
  const fields = result.success && result.data ? result.data : [];

  return <CustomFieldsManager initialFields={fields} />;
}
