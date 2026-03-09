import { Text, View } from '@react-pdf/renderer'
import type { InvoiceData, InvoiceSettingsProps } from './types'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface InfoSectionProps {
  data: InvoiceData
  vehicleName: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
  labels: Record<string, string>
  /** Optional set of visible field IDs from the layout config. If null/undefined, all fields render. */
  visibleFields?: Set<string> | null
}

export function InfoSection({ data, vehicleName, invoiceSettings, styles, labels, visibleFields }: InfoSectionProps) {
  // When visibleFields is null/undefined, every field is shown (backward compatible).
  const show = (fieldId: string) => !visibleFields || visibleFields.has(fieldId)

  // Determine whether each info box has any visible content so we can skip
  // rendering an empty box entirely.
  const hasCustomerContent =
    data.vehicle.customer &&
    (show('customer_name') ||
      (show('customer_company') && data.vehicle.customer.company) ||
      (show('customer_address') && data.vehicle.customer.address) ||
      (show('customer_email') && data.vehicle.customer.email) ||
      (show('customer_phone') && data.vehicle.customer.phone))

  const hasVehicleContent =
    show('vehicle_name') ||
    (show('vin') && data.vehicle.vin) ||
    (show('license_plate') && data.vehicle.licensePlate) ||
    (show('mileage') && data.mileage)

  const hasServiceContent =
    show('service_title') ||
    show('service_type') ||
    (show('tech_name') && data.techName)

  return (
    <View style={styles.infoRow}>
      {hasCustomerContent && data.vehicle.customer && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{labels.billTo || 'Bill To'}</Text>
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
        </View>
      )}
      {hasVehicleContent && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
          {show('vehicle_name') && (
            <Text style={styles.infoTextBold}>{vehicleName}</Text>
          )}
          {show('vin') && data.vehicle.vin && <Text style={styles.infoTextSmall}>{labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}</Text>}
          {show('license_plate') && data.vehicle.licensePlate && (
            <Text style={styles.infoTextSmall}>{labels.plate ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate }) : `Plate: ${data.vehicle.licensePlate}`}</Text>
          )}
          {show('mileage') && data.mileage && (
            <Text style={styles.infoTextSmall}>
              {labels.mileage ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() }) : `Mileage: ${data.mileage.toLocaleString()}`}{' '}
              {invoiceSettings?.unitSystem === 'metric' ? (labels.km || 'km') : (labels.mi || 'mi')}
            </Text>
          )}
        </View>
      )}
      {hasServiceContent && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{labels.service || 'Service'}</Text>
          {show('service_title') && (
            <Text style={styles.infoTextBold}>{data.title}</Text>
          )}
          {show('service_type') && (
            <Text style={styles.infoTextSmall}>{labels.type ? fillTemplate(labels.type, { type: data.type }) : `Type: ${data.type}`}</Text>
          )}
          {show('tech_name') && data.techName && <Text style={styles.infoTextSmall}>{labels.tech ? fillTemplate(labels.tech, { tech: data.techName }) : `Tech: ${data.techName}`}</Text>}
        </View>
      )}
    </View>
  )
}
