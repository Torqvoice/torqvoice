import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { TemplateSettings } from "./template-settings";

export default async function InvoiceTemplatePage() {
  const result = await getSettings([
    SETTING_KEYS.INVOICE_PRIMARY_COLOR,
    SETTING_KEYS.INVOICE_FONT_FAMILY,
    SETTING_KEYS.INVOICE_HEADER_STYLE,
  ]);

  const settings = result.success && result.data ? result.data : {};

  return (
    <TemplateSettings
      initialValues={{
        primaryColor: settings[SETTING_KEYS.INVOICE_PRIMARY_COLOR] || "#d97706",
        fontFamily: settings[SETTING_KEYS.INVOICE_FONT_FAMILY] || "Helvetica",
        headerStyle: settings[SETTING_KEYS.INVOICE_HEADER_STYLE] || "standard",
      }}
    />
  );
}
