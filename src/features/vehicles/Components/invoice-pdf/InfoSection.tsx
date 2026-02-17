import { Text, View } from '@react-pdf/renderer'
import type { InvoiceData, InvoiceSettingsProps } from './types'
import type { Style } from '@react-pdf/types'

interface InfoSectionProps {
  data: InvoiceData
  vehicleName: string
  invoiceSettings?: InvoiceSettingsProps
  styles: Record<string, Style>
}

export function InfoSection({ data, vehicleName, invoiceSettings, styles }: InfoSectionProps) {
  return (
    <View style={styles.infoRow}>
      {data.vehicle.customer && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Bill To</Text>
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
        <Text style={styles.infoLabel}>Vehicle</Text>
        <Text style={styles.infoTextBold}>{vehicleName}</Text>
        {data.vehicle.vin && <Text style={styles.infoTextSmall}>VIN: {data.vehicle.vin}</Text>}
        {data.vehicle.licensePlate && (
          <Text style={styles.infoTextSmall}>Plate: {data.vehicle.licensePlate}</Text>
        )}
        {data.mileage && (
          <Text style={styles.infoTextSmall}>
            Mileage: {data.mileage.toLocaleString()}{' '}
            {invoiceSettings?.unitSystem === 'metric' ? 'km' : 'mi'}
          </Text>
        )}
      </View>
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>Service</Text>
        <Text style={styles.infoTextBold}>{data.title}</Text>
        <Text style={styles.infoTextSmall}>Type: {data.type}</Text>
        {data.techName && <Text style={styles.infoTextSmall}>Tech: {data.techName}</Text>}
      </View>
    </View>
  )
}
