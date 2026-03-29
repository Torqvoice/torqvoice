import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from '../invoice-pdf/styles'
import type { WorkshopInfo, InvoiceSettingsProps } from '../invoice-pdf/types'

interface ServiceHistoryRecord {
  id: string
  title: string
  type: string
  status: string
  serviceDate: Date
  mileage: number | null
  techName: string | null
  invoiceNumber: string | null
  cost: number
  totalAmount: number
  partItems: { name: string; quantity: number; unitPrice: number; total: number }[]
  laborItems: { description: string; hours: number; rate: number; total: number }[]
}

interface ServiceHistoryPDFProps {
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number
    customer: {
      name: string
      email: string | null
      phone: string | null
      company: string | null
    } | null
  }
  records: ServiceHistoryRecord[]
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  logoDataUri?: string
  template?: {
    primaryColor?: string
    fontFamily?: string
    showLogo?: boolean
    showCompanyName?: boolean
    logoSize?: number
  }
  torqvoiceLogoDataUri?: string
  labels?: Record<string, string>
}

function formatCurrencyPdf(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`
  }
}

export function ServiceHistoryPDF({
  vehicle,
  records,
  workshop,
  invoiceSettings,
  logoDataUri,
  template,
  torqvoiceLogoDataUri,
  labels = {},
}: ServiceHistoryPDFProps) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const styles = createStyles(primaryColor, fontFamily)
  const fontBold = getFontBold(fontFamily)
  const cc = invoiceSettings?.currencyCode || 'USD'
  const df = invoiceSettings?.dateFormat || DEFAULT_DATE_FORMAT
  const tz = invoiceSettings?.timezone || undefined
  const unitLabel = invoiceSettings?.unitSystem === 'metric' ? (labels.km || 'km') : (labels.mi || 'mi')

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const shopDisplayName = workshop?.name || 'Torqvoice'

  const grandTotal = records.reduce((sum, r) => {
    const display = r.totalAmount > 0 ? r.totalAmount : r.cost
    return sum + display
  }, 0)

  const totalParts = records.reduce((sum, r) => sum + r.partItems.length, 0)
  const totalLabor = records.reduce((sum, r) => sum + r.laborItems.length, 0)

  const logoScale = (template?.logoSize || 100) / 100

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {showLogo && logoDataUri && (
              <Image
                src={logoDataUri}
                style={{
                  maxWidth: 40 * logoScale,
                  maxHeight: 40 * logoScale,
                  marginBottom: 6,
                  borderRadius: 4,
                  objectFit: 'contain',
                  objectPosition: 'left',
                }}
              />
            )}
            {showCompanyName && <Text style={styles.brandName}>{shopDisplayName}</Text>}
            {workshop?.address && <Text style={styles.brandSub}>{workshop.address}</Text>}
            {workshop?.phone && (
              <Text style={styles.brandContact}>
                {labels.tel ? labels.tel.replace('{phone}', workshop.phone) : `Tel: ${workshop.phone}`}
              </Text>
            )}
            {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
            {torqvoiceLogoDataUri && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
                <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
              </View>
            )}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>{labels.serviceHistoryTitle || 'SERVICE HISTORY'}</Text>
            <Text style={styles.invoiceNumber}>
              {formatDateForPdf(new Date(), df, tz)}
            </Text>
          </View>
        </View>

        {/* Vehicle & Customer Info */}
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
              <Text style={styles.infoTextBold}>{vehicleName}</Text>
              {vehicle.vin && (
                <Text style={styles.infoTextSmall}>
                  {labels.vin ? labels.vin.replace('{vin}', vehicle.vin) : `VIN: ${vehicle.vin}`}
                </Text>
              )}
              {vehicle.licensePlate && (
                <Text style={styles.infoTextSmall}>
                  {labels.plate ? labels.plate.replace('{plate}', vehicle.licensePlate) : `Plate: ${vehicle.licensePlate}`}
                </Text>
              )}
              <Text style={styles.infoTextSmall}>
                {labels.mileage
                  ? labels.mileage.replace('{mileage}', `${vehicle.mileage.toLocaleString()} ${unitLabel}`)
                  : `Mileage: ${vehicle.mileage.toLocaleString()} ${unitLabel}`}
              </Text>
            </View>
          </View>
          {vehicle.customer && (
            <View style={{ flex: 1 }}>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>{labels.billTo || 'Customer'}</Text>
                <Text style={styles.infoTextBold}>{vehicle.customer.name}</Text>
                {vehicle.customer.company && (
                  <Text style={styles.infoTextSmall}>{vehicle.customer.company}</Text>
                )}
                {vehicle.customer.email && (
                  <Text style={styles.infoTextSmall}>{vehicle.customer.email}</Text>
                )}
                {vehicle.customer.phone && (
                  <Text style={styles.infoTextSmall}>{vehicle.customer.phone}</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Summary Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1, padding: 8, backgroundColor: '#f3f4f6', borderRadius: 4, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
              {records.length}
            </Text>
            <Text style={{ fontSize: 8, color: gray }}>
              {labels.totalServices || 'Total Services'}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 8, backgroundColor: '#f3f4f6', borderRadius: 4, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
              {totalParts}
            </Text>
            <Text style={{ fontSize: 8, color: gray }}>
              {labels.totalPartsUsed || 'Parts Used'}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 8, backgroundColor: '#f3f4f6', borderRadius: 4, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
              {totalLabor}
            </Text>
            <Text style={{ fontSize: 8, color: gray }}>
              {labels.totalLaborItems || 'Labor Items'}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 8, backgroundColor: '#f3f4f6', borderRadius: 4, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
              {formatCurrencyPdf(grandTotal, cc)}
            </Text>
            <Text style={{ fontSize: 8, color: gray }}>
              {labels.grandTotal || 'Grand Total'}
            </Text>
          </View>
        </View>

        {/* Service Records Table */}
        <Text style={styles.sectionTitle}>{labels.serviceRecords || 'Service Records'}</Text>
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: '15%' }]}>{labels.date || 'Date'}</Text>
            <Text style={[styles.tableHeaderCell, { width: '30%' }]}>{labels.serviceTitle || 'Service'}</Text>
            <Text style={[styles.tableHeaderCell, { width: '12%' }]}>{labels.type || 'Type'}</Text>
            <Text style={[styles.tableHeaderCell, { width: '12%' }]}>{labels.status || 'Status'}</Text>
            <Text style={[styles.tableHeaderCell, { width: '13%', textAlign: 'right' }]}>{labels.mileageCol || 'Mileage'}</Text>
            <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'right' }]}>{labels.total || 'Total'}</Text>
          </View>

          {/* Table Rows */}
          {records.map((record) => {
            const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
            return (
              <View key={record.id} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, { width: '15%' }]}>
                  {formatDateForPdf(record.serviceDate, df, tz)}
                </Text>
                <View style={{ width: '30%' }}>
                  <Text style={styles.tableCellBold}>{record.title}</Text>
                  {record.invoiceNumber && (
                    <Text style={{ fontSize: 7, color: gray }}>{record.invoiceNumber}</Text>
                  )}
                </View>
                <Text style={[styles.tableCell, { width: '12%', textTransform: 'capitalize' }]}>
                  {record.type}
                </Text>
                <Text style={[styles.tableCell, { width: '12%', textTransform: 'capitalize' }]}>
                  {record.status}
                </Text>
                <Text style={[styles.tableCell, { width: '13%', textAlign: 'right' }]}>
                  {record.mileage ? record.mileage.toLocaleString() : '-'}
                </Text>
                <Text style={[styles.tableCellBold, { width: '18%', textAlign: 'right' }]}>
                  {formatCurrencyPdf(displayTotal, cc)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Grand Total */}
        <View style={styles.totalsBox}>
          <View style={styles.totalDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{labels.grandTotal || 'Grand Total'}</Text>
            <Text style={styles.grandTotalValue}>{formatCurrencyPdf(grandTotal, cc)}</Text>
          </View>
        </View>

        {/* Footer */}
        {torqvoiceLogoDataUri ? (
          <View
            style={{
              ...styles.footer,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 8, color: gray }}>
              {shopDisplayName} · {labels.serviceHistoryTitle || 'Service History'}
            </Text>
            <Text style={{ fontSize: 7, color: gray }}> · {labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>
            {shopDisplayName} · {labels.serviceHistoryTitle || 'Service History'} · {vehicleName}
          </Text>
        )}
      </Page>
    </Document>
  )
}
