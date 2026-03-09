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
  /** Controls which fields are shown within this section. */
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
// Custom field ID helpers
// ---------------------------------------------------------------------------

export const CUSTOM_FIELD_PREFIX = "cf_";

export function isCustomFieldId(id: string): boolean {
  return id.startsWith(CUSTOM_FIELD_PREFIX);
}

export function toCustomFieldId(definitionId: string): string {
  return `${CUSTOM_FIELD_PREFIX}${definitionId}`;
}

export function fromCustomFieldId(cfId: string): string {
  return cfId.slice(CUSTOM_FIELD_PREFIX.length);
}

// ---------------------------------------------------------------------------
// Constants – built-in section & field definitions
// ---------------------------------------------------------------------------

export const BUILTIN_SECTIONS = [
  { id: "header", name: "Header" },
  { id: "customer", name: "Customer" },
  { id: "vehicle", name: "Vehicle" },
  { id: "service", name: "Service" },
  { id: "parts_table", name: "Parts Table" },
  { id: "labor_table", name: "Labor Table" },
  { id: "totals", name: "Totals" },
  { id: "notes", name: "Notes" },
  { id: "diagnostic_notes", name: "Diagnostic Notes" },
  { id: "bank_account", name: "Bank Account" },
  { id: "footer", name: "Footer" },
  { id: "general", name: "General" },
] as const;

export const BUILTIN_CUSTOMER_FIELDS = [
  { id: "customer_name", name: "Customer Name" },
  { id: "customer_company", name: "Customer Company" },
  { id: "customer_address", name: "Customer Address" },
  { id: "customer_email", name: "Customer Email" },
  { id: "customer_phone", name: "Customer Phone" },
] as const;

export const BUILTIN_VEHICLE_FIELDS = [
  { id: "vehicle_name", name: "Vehicle" },
  { id: "vin", name: "VIN" },
  { id: "license_plate", name: "License Plate" },
  { id: "mileage", name: "Mileage" },
] as const;

export const BUILTIN_SERVICE_FIELDS = [
  { id: "service_title", name: "Service Title" },
  { id: "service_type", name: "Service Type" },
  { id: "tech_name", name: "Technician" },
] as const;

/** @deprecated Use BUILTIN_CUSTOMER_FIELDS, BUILTIN_VEHICLE_FIELDS, BUILTIN_SERVICE_FIELDS */
export const BUILTIN_INFO_FIELDS = [
  ...BUILTIN_CUSTOMER_FIELDS,
  ...BUILTIN_VEHICLE_FIELDS,
  ...BUILTIN_SERVICE_FIELDS,
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
export type BuiltinCustomerFieldId = (typeof BUILTIN_CUSTOMER_FIELDS)[number]["id"];
export type BuiltinVehicleFieldId = (typeof BUILTIN_VEHICLE_FIELDS)[number]["id"];
export type BuiltinServiceFieldId = (typeof BUILTIN_SERVICE_FIELDS)[number]["id"];
export type BuiltinHeaderFieldId = (typeof BUILTIN_HEADER_FIELDS)[number]["id"];
export type BuiltinBankAccountFieldId = (typeof BUILTIN_BANK_ACCOUNT_FIELDS)[number]["id"];

/** Sections that have configurable fields */
export const SECTIONS_WITH_FIELDS = new Set<string>([
  "header",
  "customer",
  "vehicle",
  "service",
  "bank_account",
  "general",
]);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function getDefaultFieldsForSection(sectionId: string): InvoiceFieldConfig[] | undefined {
  switch (sectionId) {
    case "customer":
      return BUILTIN_CUSTOMER_FIELDS.map((f) => ({ id: f.id, visible: true }));
    case "vehicle":
      return BUILTIN_VEHICLE_FIELDS.map((f) => ({ id: f.id, visible: true }));
    case "service":
      return BUILTIN_SERVICE_FIELDS.map((f) => ({ id: f.id, visible: true }));
    case "header":
      return BUILTIN_HEADER_FIELDS.map((f) => ({ id: f.id, visible: true }));
    case "bank_account":
      return BUILTIN_BANK_ACCOUNT_FIELDS.map((f) => ({ id: f.id, visible: true }));
    case "general":
      return []; // no built-in fields, only custom fields
    default:
      return undefined;
  }
}

export function getDefaultInvoiceLayout(): InvoiceLayoutConfig {
  return {
    sections: BUILTIN_SECTIONS.map((s, index) => {
      const fields = getDefaultFieldsForSection(s.id);
      return {
        id: s.id,
        visible: s.id !== "general", // general hidden by default (no fields)
        order: index,
        ...(fields ? { fields } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Field lookup helpers (for rendering)
// ---------------------------------------------------------------------------

/** Get all built-in field definitions for a section */
export function getBuiltinFieldsForSection(
  sectionId: string,
): ReadonlyArray<{ id: string; name: string }> {
  switch (sectionId) {
    case "customer": return BUILTIN_CUSTOMER_FIELDS;
    case "vehicle": return BUILTIN_VEHICLE_FIELDS;
    case "service": return BUILTIN_SERVICE_FIELDS;
    case "header": return BUILTIN_HEADER_FIELDS;
    case "bank_account": return BUILTIN_BANK_ACCOUNT_FIELDS;
    default: return [];
  }
}

/** Get the display name for a built-in field across all sections */
export function getBuiltinFieldName(fieldId: string): string | undefined {
  const allFields = [
    ...BUILTIN_CUSTOMER_FIELDS,
    ...BUILTIN_VEHICLE_FIELDS,
    ...BUILTIN_SERVICE_FIELDS,
    ...BUILTIN_HEADER_FIELDS,
    ...BUILTIN_BANK_ACCOUNT_FIELDS,
  ];
  return allFields.find((f) => f.id === fieldId)?.name;
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

  // Migrate old format: split "info" into customer/vehicle/service
  const migrated = migrateFromLegacy(saved.sections);

  const merged: InvoiceSection[] = [];
  const seen = new Set<string>();

  for (const section of migrated) {
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

  // Append any new built-in sections that are missing from saved.
  let nextOrder = Math.max(...migrated.map((s) => s.order), -1) + 1;

  for (const def of defaults.sections) {
    if (!seen.has(def.id)) {
      merged.push({ ...def, order: nextOrder++ });
    }
  }

  return { sections: merged };
}

// ---------------------------------------------------------------------------
// Legacy migration: "info" → customer/vehicle/service,
//                    "custom_fields" → "general"
// ---------------------------------------------------------------------------

const CUSTOMER_FIELD_IDS: Set<string> = new Set(BUILTIN_CUSTOMER_FIELDS.map((f) => f.id));
const VEHICLE_FIELD_IDS: Set<string> = new Set(BUILTIN_VEHICLE_FIELDS.map((f) => f.id));
const SERVICE_FIELD_IDS: Set<string> = new Set(BUILTIN_SERVICE_FIELDS.map((f) => f.id));

function migrateFromLegacy(sections: InvoiceSection[]): InvoiceSection[] {
  const hasInfo = sections.some((s) => s.id === "info");
  const hasCustomFields = sections.some((s) => s.id === "custom_fields");

  // Already in new format
  if (!hasInfo && !hasCustomFields) {
    return sections;
  }

  const result: InvoiceSection[] = [];

  for (const section of sections) {
    if (section.id === "info") {
      // Split into customer, vehicle, service
      const customerFields: InvoiceFieldConfig[] = [];
      const vehicleFields: InvoiceFieldConfig[] = [];
      const serviceFields: InvoiceFieldConfig[] = [];
      const customFieldRefs: InvoiceFieldConfig[] = [];

      if (section.fields) {
        for (const field of section.fields) {
          if (CUSTOMER_FIELD_IDS.has(field.id)) {
            customerFields.push(field);
          } else if (VEHICLE_FIELD_IDS.has(field.id)) {
            vehicleFields.push(field);
          } else if (SERVICE_FIELD_IDS.has(field.id)) {
            serviceFields.push(field);
          } else if (isCustomFieldId(field.id)) {
            customFieldRefs.push(field);
          }
        }
      }

      // Use the info section's order as base, insert three sections
      const baseOrder = section.order;
      result.push({
        id: "customer",
        visible: section.visible,
        order: baseOrder,
        fields: customerFields.length > 0 ? customerFields : undefined,
      });
      result.push({
        id: "vehicle",
        visible: section.visible,
        order: baseOrder + 0.1,
        fields: vehicleFields.length > 0 ? vehicleFields : undefined,
      });
      result.push({
        id: "service",
        visible: section.visible,
        order: baseOrder + 0.2,
        fields: serviceFields.length > 0 ? serviceFields : undefined,
      });

      // If the old info section had custom fields, add them to general
      if (customFieldRefs.length > 0) {
        result.push({
          id: "general",
          visible: section.visible,
          order: baseOrder + 0.3,
          fields: customFieldRefs,
        });
      }
    } else if (section.id === "custom_fields") {
      // Rename to general, keep any cf_ field references
      result.push({
        ...section,
        id: "general",
      });
    } else {
      result.push(section);
    }
  }

  // Normalize order values to integers
  result.sort((a, b) => a.order - b.order);
  result.forEach((s, i) => {
    s.order = i;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Field merge helper
// ---------------------------------------------------------------------------

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

  // Append any missing default fields
  for (const def of defaults) {
    if (!seen.has(def.id)) {
      merged.push(def);
    }
  }

  return merged;
}
