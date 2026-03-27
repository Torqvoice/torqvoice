"use client";

import { useMemo, useState, useEffect } from "react";
import { useMessages } from "next-intl";
import { PDFViewer } from "@react-pdf/renderer";
import "@/features/vehicles/Components/invoice-pdf/fonts.client";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import { QuotePDF } from "@/features/quotes/Components/QuotePDF";
import type { InvoiceLayoutPreviewProps } from "./InvoiceLayoutPreview";
import { useServiceType } from "@/components/service-type-context";

// ---------------------------------------------------------------------------
// Dummy data matching InvoiceData type exactly
// ---------------------------------------------------------------------------

function buildDummyCustomFields(
  customFields?: InvoiceLayoutPreviewProps["customFields"],
) {
  if (!customFields) return [];
  return customFields
    .filter((f) => f.isActive && f.entityType === "service_record")
    .map((f) => ({
      fieldId: f.id,
      label: f.label,
      value:
        f.fieldType === "checkbox"
          ? "true"
          : f.fieldType === "number"
            ? "42"
            : f.fieldType === "date"
              ? "2026-03-10"
              : "Sample value",
      fieldType: f.fieldType,
    }));
}

const DUMMY_INVOICE_DATA = {
  id: "preview-dummy-id-00000001",
  title: "Brake Service & Oil Change",
  description: null,
  type: "Maintenance",
  serviceDate: new Date("2026-03-10"),
  startDateTime: new Date("2026-03-10"),
  shopName: "Your Workshop",
  techName: "Mike Johnson",
  mileage: 45230,
  diagnosticNotes:
    "<p>Brake wear at 15%. Recommended replacement within 5,000 miles.</p>",
  invoiceNotes:
    "<p>Front brake pads replaced. Oil and filter changed with synthetic 5W-30. Next service recommended at 50,000 miles.</p>",
  subtotal: 314.5,
  taxRate: 8,
  taxAmount: 25.16,
  totalAmount: 339.66,
  cost: 339.66,
  invoiceNumber: "INV-2026-1001",
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [
    {
      partNumber: "BP-001",
      name: "Brake Pads (Front)",
      quantity: 2,
      unitPrice: 45.0,
      total: 90.0,
    },
    {
      partNumber: "OF-042",
      name: "Oil Filter",
      quantity: 1,
      unitPrice: 12.0,
      total: 12.0,
    },
    {
      partNumber: "SO-530",
      name: "Synthetic Oil 5W-30",
      quantity: 5,
      unitPrice: 8.5,
      total: 42.5,
    },
  ],
  laborItems: [
    {
      description: "Brake Replacement",
      hours: 1.5,
      rate: 85.0,
      total: 127.5,
    },
    { description: "Oil Change", hours: 0.5, rate: 85.0, total: 42.5 },
  ],
  vehicle: {
    make: "Toyota",
    model: "Camry",
    year: 2022,
    vin: "1HGBH41JXMN109186",
    licensePlate: "ABC-1234",
    mileage: 45230,
    customer: {
      name: "John Smith",
      email: "john@example.com",
      phone: "(555) 123-4567",
      address: "123 Main Street, Springfield",
      company: "Smith Auto Group",
    },
  },
};

const DUMMY_QUOTE_DATA = {
  quoteNumber: "QT-2026-1001",
  title: "Brake Service & Oil Change",
  description: null,
  validUntil: new Date("2026-04-10"),
  createdAt: new Date("2026-03-10"),
  subtotal: 314.5,
  taxRate: 8,
  taxAmount: 25.16,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 339.66,
  notes: "<p>Front brake pads replacement recommended. Oil and filter change with synthetic 5W-30.</p>",
  partItems: [
    {
      partNumber: "BP-001",
      name: "Brake Pads (Front)",
      quantity: 2,
      unitPrice: 45.0,
      total: 90.0,
    },
    {
      partNumber: "OF-042",
      name: "Oil Filter",
      quantity: 1,
      unitPrice: 12.0,
      total: 12.0,
    },
    {
      partNumber: "SO-530",
      name: "Synthetic Oil 5W-30",
      quantity: 5,
      unitPrice: 8.5,
      total: 42.5,
    },
  ],
  laborItems: [
    {
      description: "Brake Replacement",
      hours: 1.5,
      rate: 85.0,
      total: 127.5,
    },
    { description: "Oil Change", hours: 0.5, rate: 85.0, total: 42.5 },
  ],
  customer: {
    name: "John Smith",
    email: "john@example.com",
    phone: "(555) 123-4567",
    address: "123 Main Street, Springfield",
    company: "Smith Auto Group",
  },
  vehicle: {
    make: "Toyota",
    model: "Camry",
    year: 2022,
    vin: "1HGBH41JXMN109186",
    licensePlate: "ABC-1234",
  },
};

const DUMMY_WORKSHOP = {
  name: "Your Workshop",
  address: "123 Main Street, Springfield",
  phone: "(555) 123-4567",
  email: "shop@example.com",
};

const DUMMY_INVOICE_SETTINGS = {
  bankAccount: "1234 5678 9012 3456",
  orgNumber: "912 345 678",
  paymentTerms: "Net 14",
  footerNote: "",
  showBankAccount: true,
  showOrgNumber: true,
  dueDays: 14,
  currencyCode: "USD",
  unitSystem: "imperial",
};

// ---------------------------------------------------------------------------
// Renderer (loaded only client-side via dynamic import)
// ---------------------------------------------------------------------------

export function InvoiceLayoutPreviewRenderer({
  config,
  documentType,
  customFields,
  template,
  logoUrl,
}: InvoiceLayoutPreviewProps) {
  const messages = useMessages();
  const serviceType = useServiceType();

  const labels = useMemo(() => {
    const pdf = (messages?.pdf ?? {}) as Record<string, Record<string, string>>;
    const namespace = documentType === "quote" ? "quote" : "invoice";
    const baseLabels = {
      ...(pdf[namespace] ?? {}),
      ...(pdf.common ?? {}),
    };
    // Override labels for boat service type
    if (serviceType === "boat") {
      const ns = pdf[namespace] ?? {};
      if (ns.mileageBoat) baseLabels.mileage = ns.mileageBoat;
      if (ns.vinBoat) baseLabels.vin = ns.vinBoat;
      if (ns.plateBoat) baseLabels.plate = ns.plateBoat;
      if (ns.vehicleBoat) baseLabels.vehicle = ns.vehicleBoat;
      baseLabels.km = "hrs";
      baseLabels.mi = "hrs";
    }
    return baseLabels;
  }, [messages, documentType, serviceType]);

  const dummyCf = useMemo(
    () => buildDummyCustomFields(customFields),
    [customFields],
  );

  // Stable key to force PDFViewer remount when layout changes
  const configKey = useMemo(
    () =>
      config.sections
        .map((s) => `${s.id}:${s.order}:${s.visible}:${s.column ?? "f"}`)
        .join("|"),
    [config],
  );

  const templateConfig = useMemo(
    () => ({
      primaryColor: template.primaryColor,
      fontFamily: template.fontFamily,
      headerStyle: template.headerStyle,
      logoSize: template.logoSize,
      showLogo: true,
      showCompanyName: true,
      layoutConfig: config,
    }),
    [template, config],
  );

  const invoiceData = useMemo(
    () => ({ ...DUMMY_INVOICE_DATA, customFields: dummyCf }),
    [dummyCf],
  );

  const isQuote = documentType === "quote";

  // Generate dummy Telegram QR for preview if section is visible
  const telegramQrVisible = config.sections.some(
    (s) => s.id === "telegram_qr" && s.visible
  );
  const [telegramQrDataUri, setTelegramQrDataUri] = useState<string | undefined>();
  useEffect(() => {
    if (!telegramQrVisible) { setTelegramQrDataUri(undefined); return; }
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL("https://t.me/example_bot", { width: 200, margin: 1 }).then(
        (uri) => setTelegramQrDataUri(uri)
      );
    });
  }, [telegramQrVisible]);

  return (
    <div className="rounded-lg shadow-sm overflow-hidden bg-gray-100">
      <PDFViewer
        key={configKey}
        width="100%"
        height={920}
        showToolbar={false}
        style={{ border: "none" }}
      >
        {isQuote ? (
          <QuotePDF
            data={DUMMY_QUOTE_DATA}
            workshop={DUMMY_WORKSHOP}
            currencyCode={DUMMY_INVOICE_SETTINGS.currencyCode}
            logoDataUri={logoUrl || undefined}
            template={templateConfig}
            customFields={dummyCf}
            labels={labels}
            layoutConfig={config}
          />
        ) : (
          <InvoicePDF
            data={invoiceData}
            workshop={DUMMY_WORKSHOP}
            invoiceSettings={DUMMY_INVOICE_SETTINGS}
            logoDataUri={logoUrl || undefined}
            template={templateConfig}
            telegramQrDataUri={telegramQrDataUri}
            telegramLabel="Chat with us on Telegram"
            labels={labels}
          />
        )}
      </PDFViewer>
    </div>
  );
}
