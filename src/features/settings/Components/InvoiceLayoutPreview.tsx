"use client";

import { useTranslations } from "next-intl";
import {
  BUILTIN_SECTIONS,
  SECTIONS_WITH_FIELDS,
  getBuiltinFieldsForSection,
  getBuiltinFieldName,
  isCustomFieldId,
  fromCustomFieldId,
  type InvoiceLayoutConfig,
} from "../Schema/invoiceLayoutSchema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldDef {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  entityType: string;
  options: string | null;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface TemplateValues {
  primaryColor: string;
  fontFamily: string;
  headerStyle: string;
}

interface InvoiceLayoutPreviewProps {
  config: InvoiceLayoutConfig;
  documentType: "invoice" | "quote";
  customFields?: FieldDef[];
  template: TemplateValues;
  logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Font map (same as template-settings.tsx)
// ---------------------------------------------------------------------------

const fontMap: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  "Times-Roman": "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldName(fieldId: string, customFields?: FieldDef[]): string {
  if (isCustomFieldId(fieldId)) {
    const defId = fromCustomFieldId(fieldId);
    const def = customFields?.find((cf) => cf.id === defId);
    return def?.label ?? def?.name ?? fieldId;
  }
  return getBuiltinFieldName(fieldId) ?? fieldId;
}

function lightenColor(hex: string, factor = 0.9): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#fef3c7";
  const r = Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * factor);
  const g = Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * factor);
  const b = Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * factor);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Dummy data
// ---------------------------------------------------------------------------

const DUMMY_CUSTOMER: Record<string, string> = {
  customer_name: "John Smith",
  customer_company: "Smith Auto Group",
  customer_address: "123 Main Street, Springfield",
  customer_email: "john@example.com",
  customer_phone: "(555) 123-4567",
};

const DUMMY_VEHICLE: Record<string, string> = {
  vehicle_name: "2022 Toyota Camry",
  vin: "1HGBH41JXMN109186",
  license_plate: "ABC-1234",
  mileage: "45,230 mi",
};

const DUMMY_SERVICE: Record<string, string> = {
  service_title: "Brake Service & Oil Change",
  service_type: "Maintenance",
  tech_name: "Mike Johnson",
};

const DUMMY_BANK: Record<string, string> = {
  bank_account: "1234 5678 9012 3456",
  org_number: "912 345 678",
};

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function getVisibleFields(
  config: InvoiceLayoutConfig,
  sectionId: string,
): Array<{ id: string; visible: boolean }> {
  const section = config.sections.find((s) => s.id === sectionId);
  if (!section?.fields) {
    const builtins = getBuiltinFieldsForSection(sectionId);
    return builtins.map((f) => ({ id: f.id, visible: true }));
  }
  return section.fields.filter((f) => f.visible);
}

function getCustomFieldsForSection(
  config: InvoiceLayoutConfig,
  sectionId: string,
  customFields?: FieldDef[],
): FieldDef[] {
  if (!customFields) return [];
  const section = config.sections.find((s) => s.id === sectionId);
  if (!section?.fields) return [];
  const cfIds = new Set(
    section.fields
      .filter((f) => f.visible && isCustomFieldId(f.id))
      .map((f) => fromCustomFieldId(f.id)),
  );
  return customFields.filter((cf) => cfIds.has(cf.id));
}

// ---------------------------------------------------------------------------
// Header component
// ---------------------------------------------------------------------------

const FALLBACK_LOGO = "/torqvoice_app_logo.png";

function LogoImg({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Logo" className={className} />
  );
}

function PreviewHeader({
  template,
  documentType,
  logoUrl,
  t,
}: {
  template: TemplateValues;
  documentType: "invoice" | "quote";
  logoUrl?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const { primaryColor, headerStyle } = template;
  const docLabel = documentType === "invoice"
    ? t("templates.tabs.invoice").toUpperCase()
    : t("templates.tabs.quotation").toUpperCase();
  const docNum = documentType === "invoice" ? "INV-2026-1001" : "QT-2026-1001";
  const logo = logoUrl || FALLBACK_LOGO;

  if (headerStyle === "compact") {
    return (
      <div
        className="flex items-center justify-between"
        style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}
      >
        <div className="flex items-center gap-2">
          <LogoImg src={logo} className="h-7 w-7 rounded object-contain" />
          <div>
            <p className="text-[11px] font-bold" style={{ color: primaryColor }}>
              Your Workshop
            </p>
            <p className="text-[8px] text-gray-500">123 Main Street, Springfield</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold">{docLabel}</p>
          <p className="text-[8px] text-gray-500">{docNum}</p>
          <p className="text-[8px] text-gray-500">Mar 10, 2026</p>
        </div>
      </div>
    );
  }

  if (headerStyle === "modern") {
    return (
      <div>
        <div
          className="flex flex-col items-center rounded p-3 text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <LogoImg src={logo} className="mb-1 h-8 w-8 rounded object-contain" />
          <p className="text-sm font-bold">Your Workshop</p>
          <p className="text-[8px] opacity-80">123 Main Street, Springfield</p>
          <div className="mt-0.5 flex justify-center gap-2 text-[7px] opacity-70">
            <span>Tel: (555) 123-4567</span>
            <span>shop@example.com</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] font-bold">{docLabel}</p>
          <div className="flex gap-2 text-[8px] text-gray-500">
            <span>{docNum}</span>
            <span>Mar 10, 2026</span>
          </div>
        </div>
      </div>
    );
  }

  // Standard
  return (
    <div
      className="flex items-start justify-between"
      style={{ borderBottom: `2px solid ${primaryColor}`, paddingBottom: 10 }}
    >
      <div>
        <LogoImg src={logo} className="mb-1 h-8 max-w-[80px] rounded object-contain object-left" />
        <p className="text-[11px] font-bold" style={{ color: primaryColor }}>
          Your Workshop
        </p>
        <p className="text-[8px] text-gray-500">123 Main Street, Springfield</p>
        <p className="text-[8px] text-gray-500">Tel: (555) 123-4567</p>
        <p className="text-[8px] text-gray-500">shop@example.com</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tracking-tight" style={{ color: primaryColor }}>
          {docLabel}
        </p>
        <p className="text-[8px] text-gray-500">{docNum}</p>
        <p className="text-[8px] text-gray-500">Mar 10, 2026</p>
        <p className="text-[8px] text-gray-500">{t("templates.previewDue", { date: "Mar 24, 2026" })}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main preview
// ---------------------------------------------------------------------------

export function InvoiceLayoutPreview({
  config,
  documentType,
  customFields,
  template,
  logoUrl,
}: InvoiceLayoutPreviewProps) {
  const t = useTranslations("settings");
  const { primaryColor, fontFamily } = template;
  const font = fontMap[fontFamily] || "sans-serif";
  const primaryBgLight = lightenColor(primaryColor);

  const sorted = [...config.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.visible);

  const infoSections = new Set(["customer", "vehicle", "service"]);
  let infoRendered = false;

  const renderFieldValue = (fieldId: string, dummyData: Record<string, string>) => {
    const value = dummyData[fieldId];
    if (!value) return null;
    const name = getBuiltinFieldName(fieldId) ?? fieldId;
    const isBold = fieldId === "customer_name" || fieldId === "vehicle_name" || fieldId === "service_title";
    return (
      <p key={fieldId} className={isBold ? "text-[10px] font-medium" : "text-[9px] text-gray-500"}>
        {isBold ? value : `${name}: ${value}`}
      </p>
    );
  };

  const renderCustomFieldDummies = (sectionCfs: FieldDef[]) =>
    sectionCfs.map((cf) => (
      <p key={cf.id} className="text-[9px] text-gray-500">
        {cf.label}: {cf.fieldType === "checkbox" ? "Yes" : cf.fieldType === "number" ? "42" : cf.fieldType === "date" ? "Mar 10, 2026" : "Sample value"}
      </p>
    ));

  const renderInfoGroup = () => {
    const customerVisible = getVisibleFields(config, "customer");
    const vehicleVisible = getVisibleFields(config, "vehicle");
    const serviceVisible = getVisibleFields(config, "service");
    const customerSection = sorted.find((s) => s.id === "customer");
    const vehicleSection = sorted.find((s) => s.id === "vehicle");
    const serviceSection = sorted.find((s) => s.id === "service");
    const customerCfs = getCustomFieldsForSection(config, "customer", customFields);
    const vehicleCfs = getCustomFieldsForSection(config, "vehicle", customFields);
    const serviceCfs = getCustomFieldsForSection(config, "service", customFields);

    return (
      <div key="info-group" className="grid grid-cols-2 gap-3 my-3">
        {/* Bill To (left) */}
        <div className="rounded p-2.5" style={{ backgroundColor: "#f3f4f6" }}>
          {customerSection && (
            <div>
              <p
                className="mb-1 text-[7px] font-bold uppercase tracking-wider"
                style={{ color: primaryColor }}
              >
                {t("templates.billTo")}
              </p>
              {customerVisible
                .filter((f) => !isCustomFieldId(f.id))
                .map((f) => renderFieldValue(f.id, DUMMY_CUSTOMER))}
              {renderCustomFieldDummies(customerCfs)}
            </div>
          )}
          {vehicleSection && (
            <div className="mt-2">
              <p
                className="mb-1 text-[7px] font-bold uppercase tracking-wider"
                style={{ color: primaryColor }}
              >
                {t("templates.vehicle")}
              </p>
              {vehicleVisible
                .filter((f) => !isCustomFieldId(f.id))
                .map((f) => renderFieldValue(f.id, DUMMY_VEHICLE))}
              {renderCustomFieldDummies(vehicleCfs)}
            </div>
          )}
        </div>

        {/* Service (right) */}
        {serviceSection && (
          <div className="rounded p-2.5" style={{ backgroundColor: "#f3f4f6" }}>
            <p
              className="mb-1 text-[7px] font-bold uppercase tracking-wider"
              style={{ color: primaryColor }}
            >
              {t("templates.previewService")}
            </p>
            {serviceVisible
              .filter((f) => !isCustomFieldId(f.id))
              .map((f) => renderFieldValue(f.id, DUMMY_SERVICE))}
            {renderCustomFieldDummies(serviceCfs)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="rounded-lg border bg-white p-5 shadow-sm"
      style={{ fontFamily: font, color: "#111827", fontSize: 10 }}
    >
      {sorted.map((section) => {
        // Info group
        if (infoSections.has(section.id)) {
          if (infoRendered) return null;
          infoRendered = true;
          return renderInfoGroup();
        }

        // Header
        if (section.id === "header") {
          return (
            <div key="header" className="mb-3">
              <PreviewHeader template={template} documentType={documentType} logoUrl={logoUrl} t={t} />
            </div>
          );
        }

        // Parts table
        if (section.id === "parts_table") {
          return (
            <div key="parts_table" className="my-2">
              <table className="w-full text-[9px]">
                <thead>
                  <tr style={{ backgroundColor: primaryBgLight }}>
                    <th className="px-1.5 py-1 text-left font-medium" style={{ color: primaryColor }}>{t("templates.part")}</th>
                    <th className="px-1.5 py-1 text-center font-medium" style={{ color: primaryColor }}>{t("templates.qty")}</th>
                    <th className="px-1.5 py-1 text-right font-medium" style={{ color: primaryColor }}>{t("templates.price")}</th>
                    <th className="px-1.5 py-1 text-right font-medium" style={{ color: primaryColor }}>{t("templates.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-1.5 py-1">Brake Pads (Front)</td>
                    <td className="px-1.5 py-1 text-center">2</td>
                    <td className="px-1.5 py-1 text-right">$45.00</td>
                    <td className="px-1.5 py-1 text-right">$90.00</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-1.5 py-1">Oil Filter</td>
                    <td className="px-1.5 py-1 text-center">1</td>
                    <td className="px-1.5 py-1 text-right">$12.00</td>
                    <td className="px-1.5 py-1 text-right">$12.00</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-1.5 py-1">Synthetic Oil 5W-30</td>
                    <td className="px-1.5 py-1 text-center">5</td>
                    <td className="px-1.5 py-1 text-right">$8.50</td>
                    <td className="px-1.5 py-1 text-right">$42.50</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }

        // Labor table
        if (section.id === "labor_table") {
          return (
            <div key="labor_table" className="my-2">
              <table className="w-full text-[9px]">
                <thead>
                  <tr style={{ backgroundColor: `${primaryColor}20` }}>
                    <th className="px-1.5 py-1 text-left font-medium" style={{ color: primaryColor }}>{t("templates.labor")}</th>
                    <th className="px-1.5 py-1 text-center font-medium" style={{ color: primaryColor }}>{t("templates.hours")}</th>
                    <th className="px-1.5 py-1 text-right font-medium" style={{ color: primaryColor }}>{t("templates.rate")}</th>
                    <th className="px-1.5 py-1 text-right font-medium" style={{ color: primaryColor }}>{t("templates.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-1.5 py-1">Brake Replacement</td>
                    <td className="px-1.5 py-1 text-center">1.5</td>
                    <td className="px-1.5 py-1 text-right">$85.00</td>
                    <td className="px-1.5 py-1 text-right">$127.50</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-1.5 py-1">Oil Change</td>
                    <td className="px-1.5 py-1 text-center">0.5</td>
                    <td className="px-1.5 py-1 text-right">$85.00</td>
                    <td className="px-1.5 py-1 text-right">$42.50</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }

        // Totals
        if (section.id === "totals") {
          return (
            <div key="totals" className="mt-2 flex justify-end">
              <div className="w-1/2 text-[9px]">
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">{t("templates.subtotal")}</span>
                  <span>$314.50</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-500">{t("templates.tax", { rate: "8" })}</span>
                  <span>$25.16</span>
                </div>
                <div
                  className="mt-1 flex justify-between border-t-2 pt-1 text-[11px] font-bold"
                  style={{ borderColor: primaryColor, color: primaryColor }}
                >
                  <span>{t("templates.total")}</span>
                  <span>$339.66</span>
                </div>
              </div>
            </div>
          );
        }

        // Notes
        if (section.id === "notes") {
          return (
            <div key="notes" className="mt-3 rounded p-2" style={{ backgroundColor: "#f3f4f6" }}>
              <p className="mb-0.5 text-[7px] font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
                {t("templates.previewNotes")}
              </p>
              <p className="text-[8px] text-gray-500 leading-relaxed">
                Front brake pads replaced. Oil and filter changed with synthetic 5W-30.
                Next service recommended at 50,000 miles.
              </p>
            </div>
          );
        }

        // Diagnostic notes
        if (section.id === "diagnostic_notes") {
          return (
            <div key="diagnostic_notes" className="mt-2 rounded p-2" style={{ backgroundColor: "#f3f4f6" }}>
              <p className="mb-0.5 text-[7px] font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
                {t("templates.previewDiagnosticNotes")}
              </p>
              <p className="text-[8px] text-gray-500 leading-relaxed">
                Brake wear at 15%. Recommended replacement within 5,000 miles.
              </p>
            </div>
          );
        }

        // Bank account
        if (section.id === "bank_account") {
          const visible = getVisibleFields(config, "bank_account");
          return (
            <div key="bank_account" className="mt-2 text-[8px] text-gray-500">
              {visible
                .filter((f) => !isCustomFieldId(f.id))
                .map((f) => {
                  const name = getBuiltinFieldName(f.id) ?? f.id;
                  const value = DUMMY_BANK[f.id] || "—";
                  return (
                    <p key={f.id}>
                      {name}: {value}
                    </p>
                  );
                })}
            </div>
          );
        }

        // Footer
        if (section.id === "footer") {
          return (
            <div
              key="footer"
              className="mt-4 border-t pt-2 text-center text-[7px] text-gray-400"
              style={{ borderColor: "#e5e7eb" }}
            >
              {t("templates.previewThankYou")} — Your Workshop · INV-2026-1001
            </div>
          );
        }

        // General (custom fields)
        if (section.id === "general") {
          const generalCfs = getCustomFieldsForSection(config, "general", customFields);
          if (generalCfs.length === 0) return null;
          return (
            <div key="general" className="mt-2">
              <p className="mb-0.5 text-[8px] font-medium text-gray-600">{t("templates.previewAdditionalInfo")}</p>
              {renderCustomFieldDummies(generalCfs)}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
