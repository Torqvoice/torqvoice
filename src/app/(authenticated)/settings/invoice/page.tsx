import { getSettings } from "@/features/settings/Actions/settingsActions";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures } from "@/lib/features";
import { getInvoiceLayoutConfig, getQuoteLayoutConfig } from "@/features/settings/Actions/invoiceLayoutActions";
import { getFieldDefinitions } from "@/features/custom-fields/Actions/customFieldActions";
import { redirect } from "next/navigation";
import { InvoiceSettings } from "./invoice-settings";

export default async function InvoiceSettingsPage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  const [result, invoiceLayoutResult, quoteLayoutResult, customFieldsResult] = await Promise.all([
    getSettings(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
    features.customFields ? getFieldDefinitions() : Promise.resolve({ success: true, data: [] }),
  ]);

  const settings = result.success && result.data ? result.data : {};
  const customFields = customFieldsResult.success && customFieldsResult.data ? customFieldsResult.data : [];

  return (
    <InvoiceSettings
      settings={settings}
      initialInvoiceLayout={invoiceLayoutResult.success ? invoiceLayoutResult.data : undefined}
      initialQuoteLayout={quoteLayoutResult.success ? quoteLayoutResult.data : undefined}
      customFields={customFields}
      customFieldsEnabled={features.customFields ?? false}
    />
  );
}
