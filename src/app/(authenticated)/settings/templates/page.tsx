import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { TemplateSettings } from "./template-settings";
import { getLayoutData } from "@/lib/get-layout-data";
import { getFeatures, isCloudMode } from "@/lib/features";
import { FeatureLockedMessage } from "../feature-locked-message";
import { redirect } from "next/navigation";
import { getTemplates, seedDefaultTemplate } from "@/features/inspections/Actions/templateActions";
import { getTranslations } from "next-intl/server";

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

  // Auto-seed default inspection template if none exist
  await seedDefaultTemplate();

  const [result, inspectionTemplatesResult] = await Promise.all([
    getSettings([
      SETTING_KEYS.INVOICE_PRIMARY_COLOR,
      SETTING_KEYS.INVOICE_FONT_FAMILY,
      SETTING_KEYS.INVOICE_HEADER_STYLE,
      SETTING_KEYS.QUOTE_PRIMARY_COLOR,
      SETTING_KEYS.QUOTE_FONT_FAMILY,
      SETTING_KEYS.QUOTE_HEADER_STYLE,
      SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
      SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
      SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
      SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
      SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
      SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
      SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
      SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
    ]),
    getTemplates(),
  ]);

  const settings = result.success && result.data ? result.data : {};
  const inspectionTemplates = inspectionTemplatesResult.success && inspectionTemplatesResult.data
    ? inspectionTemplatesResult.data
    : [];

  const t = await getTranslations('settings');

  const smsDefaultMap: Record<string, string> = {
    [SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]: t.raw('templates.smsDefaults.invoiceReady'),
    [SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]: t.raw('templates.smsDefaults.quoteReady'),
    [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]: t.raw('templates.smsDefaults.inspectionReady'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS]: t.raw('templates.smsDefaults.statusInProgress'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS]: t.raw('templates.smsDefaults.statusWaitingParts'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_READY]: t.raw('templates.smsDefaults.statusReady'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED]: t.raw('templates.smsDefaults.statusCompleted'),
    [SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED]: t.raw('templates.smsDefaults.paymentReceived'),
  };

  const smsTemplates: Record<string, string> = {};
  for (const key of Object.keys(smsDefaultMap)) {
    smsTemplates[key] = settings[key] || smsDefaultMap[key] || "";
  }

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
      inspectionTemplates={inspectionTemplates}
      smsEnabled={features.sms ?? false}
      initialSmsTemplates={smsTemplates}
    />
  );
}
