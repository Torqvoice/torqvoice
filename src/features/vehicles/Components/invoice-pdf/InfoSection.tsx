import { Text, View } from '@react-pdf/renderer'
import type { InvoiceData, InvoiceSettingsProps } from './types'
import type { Style } from '@react-pdf/types'
import { isCustomFieldId } from '@/features/settings/Schema/invoiceLayoutSchema'
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

interface SectionProps {
  data: InvoiceData
  vehicleName?: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
  labels: Record<string, string>
  visibleFields?: Set<string> | null
  customFields?: CustomFieldEntry[]
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

  const hasCustomer = data.vehicle.customer &&
    (show('customer_name') ||
      (show('customer_company') && data.vehicle.customer.company) ||
      (show('customer_address') && data.vehicle.customer.address) ||
      (show('customer_email') && data.vehicle.customer.email) ||
      (show('customer_phone') && data.vehicle.customer.phone))

  const hasCf = customFields?.some(cf => cf.value !== '' && cf.value != null)

  if (!hasCustomer && !hasCf) return null

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.billTo || 'Bill To'}</Text>
      {data.vehicle.customer && (
        <>
          {show('customer_name') && (
            <Text style={styles.infoTextBold}>{data.vehicle.customer.name}</Text>
          )}
          {show('customer_company') && data.vehicle.customer.company && (
            <Text style={styles.infoText}>{data.vehicle.customer.company}</Text>
          )}
          {show('customer_address') && data.vehicle.customer.address && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.address}</Text>
          )}
          {show('customer_email') && data.vehicle.customer.email && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.email}</Text>
          )}
          {show('customer_phone') && data.vehicle.customer.phone && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.phone}</Text>
          )}
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

  const hasVehicle =
    show('vehicle_name') ||
    (show('vin') && data.vehicle.vin) ||
    (show('license_plate') && data.vehicle.licensePlate) ||
    (show('mileage') && data.mileage)

  const hasCf = customFields?.some(cf => cf.value !== '' && cf.value != null)

  if (!hasVehicle && !hasCf) return null

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
      {show('vehicle_name') && (
        <Text style={styles.infoTextBold}>{vehicleName}</Text>
      )}
      {show('vin') && data.vehicle.vin && (
        <Text style={styles.infoTextSmall}>
          {labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}
        </Text>
      )}
      {show('license_plate') && data.vehicle.licensePlate && (
        <Text style={styles.infoTextSmall}>
          {labels.plate ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate }) : `Plate: ${data.vehicle.licensePlate}`}
        </Text>
      )}
      {show('mileage') && data.mileage && (
        <Text style={styles.infoTextSmall}>
          {labels.mileage ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() }) : `Mileage: ${data.mileage.toLocaleString()}`}{' '}
          {invoiceSettings?.unitSystem === 'metric' ? (labels.km || 'km') : (labels.mi || 'mi')}
        </Text>
      )}
      {renderCustomFields(customFields, visibleFields, styles)}
    </View>
  )
}

export function ServiceSection({ data, styles, labels, visibleFields, customFields }: SectionProps) {
  const show = (fieldId: string) => !visibleFields || visibleFields.has(fieldId)

  const hasBuiltinContent =
    show('service_title') ||
    show('service_type') ||
    (show('tech_name') && data.techName)

  const hasCfContent = customFields && customFields.some(cf => cf.value !== '' && cf.value != null)

  if (!hasBuiltinContent && !hasCfContent) return null

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{labels.service || 'Service'}</Text>
      {show('service_title') && (
        <Text style={styles.infoTextBold}>{data.title}</Text>
      )}
      {show('service_type') && (
        <Text style={styles.infoTextSmall}>{labels.type ? fillTemplate(labels.type, { type: data.type }) : `Type: ${data.type}`}</Text>
      )}
      {show('tech_name') && data.techName && <Text style={styles.infoTextSmall}>{labels.tech ? fillTemplate(labels.tech, { tech: data.techName }) : `Tech: ${data.techName}`}</Text>}
      {renderCustomFields(customFields, visibleFields, styles)}
    </View>
  )
}
