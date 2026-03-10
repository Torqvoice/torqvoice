"use client";

import { useMemo } from "react";
import { useMessages } from "next-intl";
import { PDFViewer } from "@react-pdf/renderer";
import { InvoicePDF } from "@/features/vehicles/Components/InvoicePDF";
import type { InvoiceLayoutPreviewProps } from "./InvoiceLayoutPreview";

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

const DUMMY_DATA = {
  id: "preview-dummy-id-00000001",
  title: "Brake Service & Oil Change",
  description: null,
  type: "Maintenance",
  serviceDate: new Date("2026-03-10"),
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
  customFields,
  template,
  logoUrl,
}: InvoiceLayoutPreviewProps) {
  const messages = useMessages();

  const labels = useMemo(() => {
    const pdf = (messages?.pdf ?? {}) as Record<string, Record<string, string>>;
    return {
      ...(pdf.invoice ?? {}),
      ...(pdf.common ?? {}),
    };
  }, [messages]);

  const dummyCf = useMemo(
    () => buildDummyCustomFields(customFields),
    [customFields],
  );

  const data = useMemo(
    () => ({ ...DUMMY_DATA, customFields: dummyCf }),
    [dummyCf],
  );

  const templateConfig = useMemo(
    () => ({
      primaryColor: template.primaryColor,
      fontFamily: template.fontFamily,
      headerStyle: template.headerStyle,
      showLogo: true,
      showCompanyName: true,
      layoutConfig: config,
    }),
    [template, config],
  );

  return (
    <div className="rounded-lg shadow-sm overflow-hidden bg-gray-100">
      <PDFViewer
        width="100%"
        height={920}
        showToolbar={false}
        style={{ border: "none" }}
      >
        <InvoicePDF
          data={data}
          workshop={DUMMY_WORKSHOP}
          invoiceSettings={DUMMY_INVOICE_SETTINGS}
          logoDataUri={logoUrl || undefined}
          template={templateConfig}
          labels={labels}
        />
      </PDFViewer>
    </div>
  );
}
