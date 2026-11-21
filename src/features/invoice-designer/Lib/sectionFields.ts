import {
  fieldShownUnasked,
  fromCustomFieldId,
  getBuiltinFieldName,
  getBuiltinFieldsForSection,
  type InvoiceFieldConfig,
  type InvoiceSection,
  isCustomFieldId,
  type LayoutDocumentType,
  NO_CUSTOM_FIELD_SECTIONS,
  toCustomFieldId,
  unmentionedShownFields,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/**
 * A section's field list as the designer shows it. The inspector draws its
 * rows from this and the designer's search reads the same answer, so a field
 * that gets a row is found by search without the search knowing about it.
 */

/** A field the workshop defined, as the designer is handed it. */
export interface SectionCustomField {
  id: string
  name: string
  label?: string | null
  isActive?: boolean
}

/** What the workshop has switched on, which decides the rows a section offers. */
export interface FieldGates {
  /** The German type key (HSN/TSN). */
  typeKeyEnabled: boolean
  /** The customer's Reference / PO. */
  customerReferenceEnabled: boolean
  /** The Fleet / unit number. */
  fleetNumberEnabled: boolean
  /** The workshop has defined a meter besides the odometer. */
  metersDefined: boolean
}

/** Which workshop setting a field waits on. */
export type FieldSetting = 'customerReference' | 'fleetNumber' | 'meters'

/** A translator's two calls, as much of next-intl as a field's name needs. */
type FieldTranslator = { (key: string): string; has: (key: string) => boolean }

/** A field's name, whether it is one of ours or one the workshop defined. */
export function designerFieldName(
  tField: FieldTranslator,
  isMarine: boolean,
  customFields: readonly SectionCustomField[],
  fieldId: string,
  sectionId?: string
): string {
  // The Equipment section's fields are its columns, named on their own so
  // "Type" or "Notes" there cannot be mistaken for another section's line.
  if (sectionId === 'equipment') {
    const key = `equipment_${fieldId}`
    return tField.has(key) ? tField(key) : (getBuiltinFieldName(fieldId) ?? fieldId)
  }
  if (!isCustomFieldId(fieldId)) {
    // A field that names the vehicle says boat for a marine workshop.
    if (isMarine && tField.has(`${fieldId}Marine`)) return tField(`${fieldId}Marine`)
    return tField.has(fieldId) ? tField(fieldId) : (getBuiltinFieldName(fieldId) ?? fieldId)
  }
  const definition = customFields.find((f) => f.id === fromCustomFieldId(fieldId))
  return definition?.label ?? definition?.name ?? fieldId
}

/**
 * The fields a section carries, resolved the way the generator resolves
 * them: no list of its own means every built-in field, visible.
 */
export function resolveSectionFields<F extends SectionCustomField>(
  section: Pick<InvoiceSection, 'id' | 'fields'>,
  documentType: LayoutDocumentType,
  customFields: readonly F[]
): {
  /** What the section's own list says, leftovers dropped. */
  stored: InvoiceFieldConfig[]
  /** That list, with every built-in field it never mentioned after it. */
  resolvedFields: InvoiceFieldConfig[]
  /** The workshop's fields the section could take and has not placed. */
  availableCustomFields: F[]
} {
  const builtins = getBuiltinFieldsForSection(section.id, documentType)
  const builtinIds = new Set(builtins.map((f) => f.id))
  const stored = (
    section.fields ??
    builtins.map((f) => ({
      id: f.id,
      visible: fieldShownUnasked(section.id, f.id, documentType),
    }))
  ) // A stored id no builtin list carries any more is a leftover, not a field.
    .filter((f) => isCustomFieldId(f.id) || builtinIds.has(f.id))
  // A field added after this layout was written still needs its switch.
  // Without this a saved design, which is loaded as it was stored, can never
  // reach anything built since, and the option looks simply missing. It
  // arrives off, except for what the sheet already prints unasked: the rows
  // that printed before they had a switch, and the ones behind a workshop
  // switch. The print asks the same question, so the two agree.
  const shownUnmentioned = new Set(unmentionedShownFields(section.id, stored, documentType))
  const resolvedFields: InvoiceFieldConfig[] = [
    ...stored,
    ...builtins
      .filter((f) => !stored.some((existing) => existing.id === f.id))
      .map((f) => ({ id: f.id, visible: shownUnmentioned.has(f.id) })),
  ]
  // Workshop-defined fields wait as chips below the list until they are
  // added, so the list only carries what this section actually uses. The
  // same field can still be added to several sections.
  const availableCustomFields = NO_CUSTOM_FIELD_SECTIONS.has(section.id)
    ? []
    : customFields.filter(
        (f) => f.isActive && !stored.some((existing) => existing.id === toCustomFieldId(f.id))
      )
  return { stored, resolvedFields, availableCustomFields }
}

/**
 * Whether a field gets a row: the type key's only for a workshop that
 * records it, the Reference / PO, the fleet number and the meter readings
 * only for one that uses them, and each only on the documents that have
 * somewhere to take it from.
 */
export function fieldOffered(
  sectionId: string,
  fieldId: string,
  documentType: LayoutDocumentType,
  gates: FieldGates
): boolean {
  const onCertificate = documentType === 'certificate'
  // An equipment item's meters, for a workshop that has defined a meter.
  if (sectionId === 'equipment') return fieldId !== 'meters' || gates.metersDefined
  switch (fieldId) {
    case 'hsn_tsn':
      return gates.typeKeyEnabled
    case 'customer_reference':
      return gates.customerReferenceEnabled && !onCertificate
    // The fleet number on every document, the certificate included.
    case 'fleet_number':
      return gates.fleetNumberEnabled
    case 'meter_readings':
      return gates.metersDefined && !onCertificate
    // The vehicle's photo, on the invoice, the quote and the work order.
    case 'vehicle_photo':
      return !onCertificate
    default:
      return true
  }
}

/**
 * The workshop setting that would give this field its row, or null when it
 * has one already or can never have one on this document. The type key is
 * left out on purpose: it is one country's, and a workshop that does not
 * record it is not told about it.
 */
export function fieldWaitingOnSetting(
  sectionId: string,
  fieldId: string,
  documentType: LayoutDocumentType,
  gates: FieldGates
): FieldSetting | null {
  if (fieldOffered(sectionId, fieldId, documentType, gates)) return null
  const allOn: FieldGates = {
    typeKeyEnabled: gates.typeKeyEnabled,
    customerReferenceEnabled: true,
    fleetNumberEnabled: true,
    metersDefined: true,
  }
  if (!fieldOffered(sectionId, fieldId, documentType, allOn)) return null
  if (fieldId === 'customer_reference') return 'customerReference'
  if (fieldId === 'fleet_number') return 'fleetNumber'
  return 'meters'
}
