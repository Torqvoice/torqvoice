import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { TemplateSettings } from "./template-settings";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";

export default async function TemplatePage() {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  const features = await getFeatures(data.organizationId);

  if (!features.customTemplates) {
    return (
      <FeatureLockedMessage
        feature="Templates"
        description="Choose from pre-built templates and customize colors, fonts, and header layouts for your PDF invoices and quotes."
        isCloud={isCloudMode()}
      />
    );
  }

  const result = await getSettings([
    SETTING_KEYS.INVOICE_PRIMARY_COLOR,
    SETTING_KEYS.INVOICE_FONT_FAMILY,
    SETTING_KEYS.INVOICE_HEADER_STYLE,
    SETTING_KEYS.QUOTE_PRIMARY_COLOR,
    SETTING_KEYS.QUOTE_FONT_FAMILY,
    SETTING_KEYS.QUOTE_HEADER_STYLE,
  ]);

  const settings = result.success && result.data ? result.data : {};

  return (
    <TemplateSettings
      initialInvoiceValues={{
        primaryColor: settings[SETTING_KEYS.INVOICE_PRIMARY_COLOR] || "#d97706",
        fontFamily: settings[SETTING_KEYS.INVOICE_FONT_FAMILY] || "Helvetica",
        headerStyle: settings[SETTING_KEYS.INVOICE_HEADER_STYLE] || "standard",
      }}
      initialQuoteValues={{
        primaryColor: settings[SETTING_KEYS.QUOTE_PRIMARY_COLOR] || "#d97706",
        fontFamily: settings[SETTING_KEYS.QUOTE_FONT_FAMILY] || "Helvetica",
        headerStyle: settings[SETTING_KEYS.QUOTE_HEADER_STYLE] || "standard",
      }}
    />
  );
}
