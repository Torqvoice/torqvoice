import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const invoiceFieldConfigSchema = z.object({
  id: z.string(),
  visible: z.boolean(),
});

export const invoiceSectionSchema = z.object({
  id: z.string(),
  visible: z.boolean(),
  order: z.number().int().nonnegative(),
  /** Only relevant for the "info" section – controls which fields are shown. */
  fields: z.array(invoiceFieldConfigSchema).optional(),
});

export const invoiceLayoutConfigSchema = z.object({
  sections: z.array(invoiceSectionSchema),
});

// ---------------------------------------------------------------------------
// TypeScript types (derived from Zod)
// ---------------------------------------------------------------------------

export type InvoiceFieldConfig = z.infer<typeof invoiceFieldConfigSchema>;
export type InvoiceSection = z.infer<typeof invoiceSectionSchema>;
export type InvoiceLayoutConfig = z.infer<typeof invoiceLayoutConfigSchema>;

// ---------------------------------------------------------------------------
// Constants – built-in section & field definitions
// ---------------------------------------------------------------------------

export const BUILTIN_SECTIONS = [
  { id: "header", name: "Header" },
  { id: "info", name: "Info" },
  { id: "parts_table", name: "Parts Table" },
  { id: "labor_table", name: "Labor Table" },
  { id: "totals", name: "Totals" },
  { id: "custom_fields", name: "Custom Fields" },
  { id: "notes", name: "Notes" },
  { id: "diagnostic_notes", name: "Diagnostic Notes" },
  { id: "bank_account", name: "Bank Account" },
  { id: "footer", name: "Footer" },
] as const;

export const BUILTIN_INFO_FIELDS = [
  { id: "customer_name", name: "Customer Name" },
  { id: "customer_company", name: "Customer Company" },
  { id: "customer_address", name: "Customer Address" },
  { id: "customer_email", name: "Customer Email" },
  { id: "customer_phone", name: "Customer Phone" },
  { id: "vehicle_name", name: "Vehicle" },
  { id: "vin", name: "VIN" },
  { id: "license_plate", name: "License Plate" },
  { id: "mileage", name: "Mileage" },
  { id: "service_title", name: "Service Title" },
  { id: "service_type", name: "Service Type" },
  { id: "tech_name", name: "Technician" },
] as const;

export const BUILTIN_HEADER_FIELDS = [
  { id: "logo", name: "Logo" },
  { id: "company_name", name: "Company Name" },
] as const;

export const BUILTIN_BANK_ACCOUNT_FIELDS = [
  { id: "bank_account", name: "Bank Account" },
  { id: "org_number", name: "Organization Number" },
] as const;

export type BuiltinSectionId = (typeof BUILTIN_SECTIONS)[number]["id"];
export type BuiltinInfoFieldId = (typeof BUILTIN_INFO_FIELDS)[number]["id"];
export type BuiltinHeaderFieldId = (typeof BUILTIN_HEADER_FIELDS)[number]["id"];
export type BuiltinBankAccountFieldId = (typeof BUILTIN_BANK_ACCOUNT_FIELDS)[number]["id"];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultInfoFields(): InvoiceFieldConfig[] {
  return BUILTIN_INFO_FIELDS.map((f) => ({
    id: f.id,
    visible: true,
  }));
}

function defaultHeaderFields(): InvoiceFieldConfig[] {
  return BUILTIN_HEADER_FIELDS.map((f) => ({
    id: f.id,
    visible: true,
  }));
}

function defaultBankAccountFields(): InvoiceFieldConfig[] {
  return BUILTIN_BANK_ACCOUNT_FIELDS.map((f) => ({
    id: f.id,
    visible: true,
  }));
}

function getDefaultFieldsForSection(sectionId: string): InvoiceFieldConfig[] | undefined {
  switch (sectionId) {
    case "info": return defaultInfoFields();
    case "header": return defaultHeaderFields();
    case "bank_account": return defaultBankAccountFields();
    default: return undefined;
  }
}

export function getDefaultInvoiceLayout(): InvoiceLayoutConfig {
  return {
    sections: BUILTIN_SECTIONS.map((s, index) => {
      const fields = getDefaultFieldsForSection(s.id);
      return {
        id: s.id,
        visible: true,
        order: index,
        ...(fields ? { fields } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Merge helper – fills in missing sections/fields with defaults
// ---------------------------------------------------------------------------

export function mergeWithDefaults(
  saved: Partial<InvoiceLayoutConfig>,
): InvoiceLayoutConfig {
  const defaults = getDefaultInvoiceLayout();

  if (!saved.sections || saved.sections.length === 0) {
    return defaults;
  }

  const savedById = new Map(saved.sections.map((s) => [s.id, s]));

  // Keep saved sections in their order, then append any new built-in sections
  // that weren't present in the saved config.
  const merged: InvoiceSection[] = [];
  const seen = new Set<string>();

  // First pass: walk saved sections in order and enrich them.
  for (const section of saved.sections) {
    seen.add(section.id);

    const defaultFields = getDefaultFieldsForSection(section.id);
    if (defaultFields) {
      merged.push({
        ...section,
        fields: mergeSectionFields(section.fields, defaultFields),
      });
    } else {
      merged.push(section);
    }
  }

  // Second pass: append any default sections that are missing from saved.
  let nextOrder =
    Math.max(...saved.sections.map((s) => s.order), -1) + 1;

  for (const def of defaults.sections) {
    if (!seen.has(def.id)) {
      merged.push({ ...def, order: nextOrder++ });
    }
  }

  return { sections: merged };
}

function mergeSectionFields(
  savedFields: InvoiceFieldConfig[] | undefined,
  defaults: InvoiceFieldConfig[],
): InvoiceFieldConfig[] {
  if (!savedFields || savedFields.length === 0) {
    return defaults;
  }

  const seen = new Set<string>();
  const merged: InvoiceFieldConfig[] = [];

  for (const field of savedFields) {
    seen.add(field.id);
    merged.push(field);
  }

  for (const def of defaults) {
    if (!seen.has(def.id)) {
      merged.push(def);
    }
  }

  return merged;
}
