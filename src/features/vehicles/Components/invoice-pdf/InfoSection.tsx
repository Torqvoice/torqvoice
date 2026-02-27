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
}

export function InfoSection({ data, vehicleName, invoiceSettings, styles, labels }: InfoSectionProps) {
  return (
    <View style={styles.infoRow}>
      {data.vehicle.customer && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{labels.billTo || 'Bill To'}</Text>
          <Text style={styles.infoTextBold}>{data.vehicle.customer.name}</Text>
          {data.vehicle.customer.company && (
            <Text style={styles.infoText}>{data.vehicle.customer.company}</Text>
          )}
          {data.vehicle.customer.address && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.address}</Text>
          )}
          {data.vehicle.customer.email && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.email}</Text>
          )}
          {data.vehicle.customer.phone && (
            <Text style={styles.infoTextSmall}>{data.vehicle.customer.phone}</Text>
          )}
        </View>
      )}
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
        <Text style={styles.infoTextBold}>{vehicleName}</Text>
        {data.vehicle.vin && <Text style={styles.infoTextSmall}>{labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}</Text>}
        {data.vehicle.licensePlate && (
          <Text style={styles.infoTextSmall}>{labels.plate ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate }) : `Plate: ${data.vehicle.licensePlate}`}</Text>
        )}
        {data.mileage && (
          <Text style={styles.infoTextSmall}>
            {labels.mileage ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() }) : `Mileage: ${data.mileage.toLocaleString()}`}{' '}
            {invoiceSettings?.unitSystem === 'metric' ? (labels.km || 'km') : (labels.mi || 'mi')}
          </Text>
        )}
      </View>
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{labels.service || 'Service'}</Text>
        <Text style={styles.infoTextBold}>{data.title}</Text>
        <Text style={styles.infoTextSmall}>{labels.type ? fillTemplate(labels.type, { type: data.type }) : `Type: ${data.type}`}</Text>
        {data.techName && <Text style={styles.infoTextSmall}>{labels.tech ? fillTemplate(labels.tech, { tech: data.techName }) : `Tech: ${data.techName}`}</Text>}
      </View>
    </View>
  )
}
