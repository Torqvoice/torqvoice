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
  order: z.number().int(),
  /** When set, the section renders in a 2-column row alongside other column sections. */
  column: z.enum(["left", "right"]).optional(),
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
  { id: "findings", name: "Findings" },
  { id: "totals", name: "Totals" },
  { id: "notes", name: "Notes" },
  { id: "diagnostic_notes", name: "Diagnostic Notes" },
  { id: "bank_account", name: "Bank Account" },
  { id: "footer", name: "Footer" },
  { id: "telegram_qr", name: "Telegram QR" },
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
  { id: "company_address", name: "Address" },
  { id: "company_phone", name: "Phone" },
  { id: "company_email", name: "Email" },
  { id: "company_org_number", name: "Organization Number" },
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

/** Sections that can be placed in left/right columns */
export const COLUMN_ELIGIBLE_SECTIONS = new Set<string>([
  "customer",
  "vehicle",
  "service",
  "general",
  "notes",
  "diagnostic_notes",
  "bank_account",
]);

/** Sections that MUST be full-width (cannot be in columns) */
export const FULL_WIDTH_ONLY_SECTIONS = new Set<string>([
  "header",
  "parts_table",
  "labor_table",
  "totals",
  "footer",
  "telegram_qr",
]);

/** Default column assignment for column-eligible sections */
const DEFAULT_COLUMN: Record<string, "left" | "right"> = {
  customer: "left",
  vehicle: "left",
  service: "right",
};

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
      const column = DEFAULT_COLUMN[s.id];
      return {
        id: s.id,
        visible: s.id !== "general" && s.id !== "telegram_qr", // general and telegram_qr hidden by default
        order: index,
        ...(column ? { column } : {}),
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
    // Skip duplicate section IDs (keep first occurrence)
    if (seen.has(section.id)) continue;
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
  // Insert each after its natural predecessor from the default order,
  // so e.g. "findings" lands after "labor_table" instead of at the end.
  const defaultOrder = defaults.sections.map((s) => s.id);
  const toInsert: { section: InvoiceSection; afterIdx: number }[] = [];
  for (const def of defaults.sections) {
    if (seen.has(def.id)) continue;
    const defaultIdx = defaultOrder.indexOf(def.id);
    let insertAfterIdx = -1;
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const idx = merged.findIndex((s) => s.id === defaultOrder[i]);
      if (idx !== -1) { insertAfterIdx = idx; break; }
    }
    toInsert.push({ section: def, afterIdx: insertAfterIdx });
  }
  if (toInsert.length > 0) {
    // Insert in reverse so indices stay stable
    toInsert.sort((a, b) => b.afterIdx - a.afterIdx);
    for (const { section, afterIdx } of toInsert) {
      merged.splice(afterIdx + 1, 0, { ...section, order: 0 });
    }
    // Renumber all orders as clean integers
    for (let i = 0; i < merged.length; i++) {
      merged[i] = { ...merged[i], order: i };
    }
  }

  // Auto-assign column values to column-eligible sections if none have columns
  const hasAnyColumn = merged.some((s) => s.column);
  if (!hasAnyColumn) {
    for (const section of merged) {
      if (DEFAULT_COLUMN[section.id]) {
        section.column = DEFAULT_COLUMN[section.id];
      }
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

// ---------------------------------------------------------------------------
// Rendering helper – groups sections into full-width or 2-column rows
// ---------------------------------------------------------------------------

export type RenderGroup =
  | { type: "full-width"; sectionId: string }
  | { type: "columns"; left: string[]; right: string[] };

/**
 * Groups sorted visible sections for rendering.
 * Consecutive column-assigned sections are grouped into a single 2-column row.
 * Sections without a column render as full-width.
 */
export function groupSectionsForRendering(
  sections: InvoiceSection[],
): RenderGroup[] {
  // Deduplicate by section ID (keep first occurrence by order)
  const seen = new Set<string>();
  const sorted = [...sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order)
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

  const groups: RenderGroup[] = [];
  let pendingLeft: string[] = [];
  let pendingRight: string[] = [];

  const flushColumns = () => {
    if (pendingLeft.length > 0 || pendingRight.length > 0) {
      groups.push({ type: "columns", left: [...pendingLeft], right: [...pendingRight] });
      pendingLeft = [];
      pendingRight = [];
    }
  };

  for (const section of sorted) {
    if (section.column === "left" || section.column === "right") {
      if (section.column === "left") pendingLeft.push(section.id);
      else pendingRight.push(section.id);
    } else {
      flushColumns();
      groups.push({ type: "full-width", sectionId: section.id });
    }
  }
  flushColumns();

  return groups;
}

// ---------------------------------------------------------------------------
// Shared field-ordering helper
// ---------------------------------------------------------------------------

/**
 * Returns field IDs in the order specified by a layout config's visible fields Set.
 * The Set's iteration order reflects the layout config ordering.
 * Falls back to `defaults` when no config is provided.
 */
export function getOrderedFieldIds(
  visibleFields: Set<string> | null | undefined,
  defaults: string[],
): string[] {
  if (!visibleFields) return defaults;
  // Set iteration order = insertion order = layout config order
  const ordered = [...visibleFields].filter((id) => !isCustomFieldId(id));
  return ordered.length > 0 ? ordered : defaults;
}

/**
 * Returns a Set of visible field IDs for a given section, preserving field order.
 * Returns null if no layout config is present (meaning show all fields).
 */
export function getVisibleFieldsForSection(
  layoutConfig: InvoiceLayoutConfig | undefined | null,
  sectionId: string,
): Set<string> | null {
  if (!layoutConfig) return null;
  const section = layoutConfig.sections.find((s) => s.id === sectionId);
  if (!section?.fields) return null;
  return new Set(section.fields.filter((f) => f.visible).map((f) => f.id));
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
