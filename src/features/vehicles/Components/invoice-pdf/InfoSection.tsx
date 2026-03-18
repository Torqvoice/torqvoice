import React from 'react'
import { Text, View } from '@react-pdf/renderer'
import type { InvoiceData, InvoiceSettingsProps } from './types'
import type { Style } from '@react-pdf/types'
import { isCustomFieldId, getOrderedFieldIds } from '@/features/settings/Schema/invoiceLayoutSchema'
import { formatFieldValue } from './CustomFields'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface CustomFieldEntry {
  fieldId: string
  label: string
  value: string
  fieldType: string
}

/**
 * Renders custom fields inline, ordered by visibleFields if available.
 */
function renderCustomFields(
  customFields: CustomFieldEntry[] | undefined,
  visibleFields: Set<string> | null | undefined,
  styles: Record<string, Style>,
) {
  if (!customFields || customFields.length === 0) return null

  let ordered = customFields
  if (visibleFields) {
    const cfOrder = [...visibleFields].filter(id => isCustomFieldId(id))
    const cfMap = new Map(customFields.map(cf => [`cf_${cf.fieldId}`, cf]))
    ordered = cfOrder.map(id => cfMap.get(id)).filter(Boolean) as CustomFieldEntry[]
  }

  return (
    <>
      {ordered
        .filter(cf => cf.value !== '' && cf.value != null)
        .map((cf, i) => (
          <Text key={`cf-${i}`} style={styles.infoTextSmall}>
            {cf.label}: {formatFieldValue(cf.value, cf.fieldType)}
          </Text>
        ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Field renderers keyed by field ID
// ---------------------------------------------------------------------------

interface CustomerRenderCtx {
  data: InvoiceData
  styles: Record<string, Style>
  labels: Record<string, string>
}

function renderCustomerField(fieldId: string, ctx: CustomerRenderCtx): React.ReactNode {
  const { data, styles } = ctx
  const c = data.vehicle.customer
  if (!c) return null

  switch (fieldId) {
    case 'customer_name':
      return <Text key={fieldId} style={styles.infoTextBold}>{c.name}</Text>
    case 'customer_company':
      return c.company ? <Text key={fieldId} style={styles.infoText}>{c.company}</Text> : null
    case 'customer_address':
      return c.address ? <Text key={fieldId} style={styles.infoTextSmall}>{c.address}</Text> : null
    case 'customer_email':
      return c.email ? <Text key={fieldId} style={styles.infoTextSmall}>{c.email}</Text> : null
    case 'customer_phone':
      return c.phone ? <Text key={fieldId} style={styles.infoTextSmall}>{c.phone}</Text> : null
    default:
      return null
  }
}

interface VehicleRenderCtx {
  data: InvoiceData
  vehicleName?: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
  labels: Record<string, string>
}

function renderVehicleField(fieldId: string, ctx: VehicleRenderCtx): React.ReactNode {
  const { data, vehicleName, invoiceSettings, styles, labels } = ctx

  switch (fieldId) {
    case 'vehicle_name':
      return <Text key={fieldId} style={styles.infoTextBold}>{vehicleName}</Text>
    case 'vin':
      return data.vehicle.vin ? (
        <Text key={fieldId} style={styles.infoTextSmall}>
          {labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}
        </Text>
      ) : null
    case 'license_plate':
      return data.vehicle.licensePlate ? (
        <Text key={fieldId} style={styles.infoTextSmall}>
          {labels.plate ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate }) : `Plate: ${data.vehicle.licensePlate}`}
        </Text>
      ) : null
    case 'mileage':
      return data.mileage ? (
        <Text key={fieldId} style={styles.infoTextSmall}>
          {labels.mileage ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() }) : `Mileage: ${data.mileage.toLocaleString()}`}{' '}
          {invoiceSettings?.unitSystem === 'metric' ? (labels.km || 'km') : (labels.mi || 'mi')}
        </Text>
      ) : null
    default:
      return null
  }
}

interface ServiceRenderCtx {
  data: InvoiceData
  styles: Record<string, Style>
  labels: Record<string, string>
}

function renderServiceField(fieldId: string, ctx: ServiceRenderCtx): React.ReactNode {
  const { data, styles, labels } = ctx

  switch (fieldId) {
    case 'service_title':
      return <Text key={fieldId} style={styles.infoTextBold}>{data.title}</Text>
    case 'service_type':
      return (
        <Text key={fieldId} style={styles.infoTextSmall}>
          {labels.type ? fillTemplate(labels.type, { type: data.type }) : `Type: ${data.type}`}
        </Text>
      )
    case 'tech_name':
      return data.techName ? (
        <Text key={fieldId} style={styles.infoTextSmall}>
          {labels.tech ? fillTemplate(labels.tech, { tech: data.techName }) : `Tech: ${data.techName}`}
        </Text>
      ) : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Default field orders (used when no layout config / visibleFields)
// ---------------------------------------------------------------------------

const DEFAULT_CUSTOMER_FIELDS = ['customer_name', 'customer_company', 'customer_address', 'customer_email', 'customer_phone']
const DEFAULT_VEHICLE_FIELDS = ['vehicle_name', 'vin', 'license_plate', 'mileage']
const DEFAULT_SERVICE_FIELDS = ['service_title', 'service_type', 'tech_name']

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

/**
 * Customer info section (Bill To).
 */
export function CustomerSection({
  data,
  styles,
  labels,
  visibleFields,
  customFields,
}: {
  data: InvoiceData
  styles: Record<string, Style>
  labels: Record<string, string>
  visibleFields?: Set<string> | null
  customFields?: CustomFieldEntry[]
}) {
  const show = (id: string) => !visibleFields || visibleFields.has(id)
  const fieldOrder = getOrderedFieldIds(visibleFields, DEFAULT_CUSTOMER_FIELDS)

  const hasCustomer = data.vehicle.customer &&
    (show('customer_name') ||
      (show('customer_company') && data.vehicle.customer.company) ||
      (show('customer_address') && data.vehicle.customer.address) ||
      (show('customer_email') && data.vehicle.customer.email) ||
      (show('customer_phone') && data.vehicle.customer.phone))

  const hasCf = customFields?.some(cf => cf.value !== '' && cf.value != null)

  if (!hasCustomer && !hasCf) return null

  const ctx: CustomerRenderCtx = { data, styles, labels }

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.billTo || 'Bill To'}</Text>
      {data.vehicle.customer && (
        <>
          {fieldOrder.filter(id => show(id)).map(id => renderCustomerField(id, ctx))}
        </>
      )}
      {renderCustomFields(customFields, visibleFields, styles)}
    </View>
  )
}

/**
 * Vehicle info section.
 */
export function VehicleSection({
  data,
  vehicleName,
  invoiceSettings,
  styles,
  labels,
  visibleFields,
  customFields,
}: {
  data: InvoiceData
  vehicleName?: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
  labels: Record<string, string>
  visibleFields?: Set<string> | null
  customFields?: CustomFieldEntry[]
}) {
  const show = (id: string) => !visibleFields || visibleFields.has(id)
  const fieldOrder = getOrderedFieldIds(visibleFields, DEFAULT_VEHICLE_FIELDS)

  const hasVehicle =
    show('vehicle_name') ||
    (show('vin') && data.vehicle.vin) ||
    (show('license_plate') && data.vehicle.licensePlate) ||
    (show('mileage') && data.mileage)

  const hasCf = customFields?.some(cf => cf.value !== '' && cf.value != null)

  if (!hasVehicle && !hasCf) return null

  const ctx: VehicleRenderCtx = { data, vehicleName, invoiceSettings, styles, labels }

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
      {fieldOrder.filter(id => show(id)).map(id => renderVehicleField(id, ctx))}
      {renderCustomFields(customFields, visibleFields, styles)}
    </View>
  )
}

export function ServiceSection({ data, styles, labels, visibleFields, customFields }: {
  data: InvoiceData
  vehicleName?: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
  labels: Record<string, string>
  visibleFields?: Set<string> | null
  customFields?: CustomFieldEntry[]
}) {
  const show = (fieldId: string) => !visibleFields || visibleFields.has(fieldId)
  const fieldOrder = getOrderedFieldIds(visibleFields, DEFAULT_SERVICE_FIELDS)

  const hasBuiltinContent =
    show('service_title') ||
    show('service_type') ||
    (show('tech_name') && data.techName)

  const hasCfContent = customFields && customFields.some(cf => cf.value !== '' && cf.value != null)

  if (!hasBuiltinContent && !hasCfContent) return null

  const ctx: ServiceRenderCtx = { data, styles, labels }

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.service || 'Service'}</Text>
      {fieldOrder.filter(id => show(id)).map(id => renderServiceField(id, ctx))}
      {renderCustomFields(customFields, visibleFields, styles)}
    </View>
  )
}
