"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { InvoiceLayoutConfig } from "../Schema/invoiceLayoutSchema";

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
  logoSize?: number;
}

export interface InvoiceLayoutPreviewProps {
  config: InvoiceLayoutConfig;
  documentType: "invoice" | "quote";
  customFields?: FieldDef[];
  template: TemplateValues;
  logoUrl?: string;
}

// The actual renderer must be in a separate file loaded only client-side
// because @react-pdf/renderer primitives fail during SSR.
const PreviewRenderer = dynamic(
  () =>
    import("./InvoiceLayoutPreviewRenderer").then(
      (mod) => mod.InvoiceLayoutPreviewRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[920px] items-center justify-center rounded-lg border bg-gray-100 text-sm text-muted-foreground">
        Loading preview…
      </div>
    ),
  },
);

export function InvoiceLayoutPreview(props: InvoiceLayoutPreviewProps) {
  return <PreviewRenderer {...props} />;
}
