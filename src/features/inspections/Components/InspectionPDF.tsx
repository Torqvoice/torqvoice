import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from '@/features/vehicles/Components/invoice-pdf/styles'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'

interface InspectionItem {
  name: string
  section: string
  condition: string
  notes: string | null
  sortOrder: number
}

interface InspectionData {
  id: string
  status: string
  mileage: number | null
  createdAt: Date
  completedAt: Date | null
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number | null
    customer?: {
      name: string
      email?: string | null
      phone?: string | null
    } | null
  }
  template: { name: string }
  items: InspectionItem[]
}

interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
}

const conditionColors: Record<string, { bg: string; text: string; label: string }> = {
  pass: { bg: '#dcfce7', text: '#166534', label: 'Pass' },
  attention: { bg: '#fef9c3', text: '#854d0e', label: 'Attention' },
  fail: { bg: '#fee2e2', text: '#991b1b', label: 'Fail' },
}

export function InspectionPDF({
  data,
  workshop,
  logoDataUri,
  torqvoiceLogoDataUri,
  dateFormat,
  timezone,
  template,
  portalUrl,
}: {
  data: InspectionData
  workshop?: WorkshopInfo
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  portalUrl?: string
}) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const headerStyle = template?.headerStyle || 'standard'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const styles = createStyles(primaryColor, fontFamily)
  const fontBold = getFontBold(fontFamily)

  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const createdDate = formatDateForPdf(data.createdAt, df, tz)
  const shopName = workshop?.name || 'Torqvoice'

  // Filter out not_inspected items and group by section
  const inspectedItems = data.items
    .filter((i) => i.condition !== 'not_inspected')
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const sectionOrder: string[] = []
  const sections: Record<string, InspectionItem[]> = {}
  for (const item of inspectedItems) {
    if (!sections[item.section]) {
      sections[item.section] = []
      sectionOrder.push(item.section)
    }
    sections[item.section].push(item)
  }

  // Counts
  const totalInspected = inspectedItems.length
  const passCount = inspectedItems.filter((i) => i.condition === 'pass').length
  const attentionCount = inspectedItems.filter((i) => i.condition === 'attention').length
  const failCount = inspectedItems.filter((i) => i.condition === 'fail').length

  const renderCompactHeader = () => (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showLogo && logoDataUri && (
            <Image
              src={logoDataUri}
              style={{ maxWidth: 40, maxHeight: 40, borderRadius: 4, objectFit: 'contain' }}
            />
          )}
          {showCompanyName && (
            <View>
              <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
                {shopName}
              </Text>
              {workshop?.address && (
                <Text style={{ fontSize: 8, color: gray }}>{workshop.address}</Text>
              )}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 14, fontFamily: fontBold, color: primaryColor }}>
            VEHICLE INSPECTION
          </Text>
          <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{createdDate}</Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 6,
          paddingHorizontal: 2,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {workshop?.phone && (
            <Text style={{ fontSize: 8, color: gray }}>Tel: {workshop.phone}</Text>
          )}
          {workshop?.email && (
            <Text style={{ fontSize: 8, color: gray }}>{workshop.email}</Text>
          )}
        </View>
        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
      </View>
    </View>
  )

  const renderModernHeader = () => (
    <View style={{ marginBottom: 24 }}>
      <View
        style={{
          backgroundColor: primaryColor,
          padding: 20,
          borderRadius: 4,
          marginHorizontal: -10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          {showLogo && logoDataUri && (
            <Image
              src={logoDataUri}
              style={{ maxWidth: 50, maxHeight: 50, borderRadius: 4, objectFit: 'contain' }}
            />
          )}
          <View style={{ alignItems: 'center' }}>
            {showCompanyName && (
              <Text style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>
                {shopName}
              </Text>
            )}
            {workshop?.address && (
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {workshop.address}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {workshop?.phone && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                  Tel: {workshop.phone}
                </Text>
              )}
              {workshop?.email && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                  {workshop.email}
                </Text>
              )}
            </View>
          </View>
        </View>
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              marginTop: 8,
            }}
          >
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, fontFamily: fontBold, color: 'rgba(255,255,255,0.7)' }}>
              Torqvoice
            </Text>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          paddingBottom: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontFamily: fontBold, color: primaryColor }}>
          VEHICLE INSPECTION
        </Text>
        <Text style={{ fontSize: 9, color: gray }}>{createdDate}</Text>
      </View>
    </View>
  )

  const renderStandardHeader = () => (
    <View style={styles.header}>
      <View>
        {showLogo && logoDataUri && (
          <Image
            src={logoDataUri}
            style={{ width: 60, height: 60, marginBottom: 6, borderRadius: 4 }}
          />
        )}
        {showCompanyName && <Text style={styles.brandName}>{shopName}</Text>}
        {workshop?.address && <Text style={styles.brandSub}>{workshop.address}</Text>}
        {workshop?.phone && <Text style={styles.brandContact}>Tel: {workshop.phone}</Text>}
        {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
      </View>
      <View>
        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginBottom: 6 }}>
            <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
            <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
        <Text style={{ ...styles.invoiceTitle, color: primaryColor }}>VEHICLE INSPECTION</Text>
        <Text style={styles.invoiceNumber}>{data.template.name}</Text>
        <Text style={styles.invoiceNumber}>{createdDate}</Text>
      </View>
    </View>
  )

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerStyle === 'compact'
          ? renderCompactHeader()
          : headerStyle === 'modern'
            ? renderModernHeader()
            : renderStandardHeader()}

        {/* Vehicle & Customer info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Vehicle</Text>
            <Text style={styles.infoTextBold}>
              {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
            </Text>
            {data.vehicle.vin && (
              <Text style={styles.infoTextSmall}>VIN: {data.vehicle.vin}</Text>
            )}
            {data.vehicle.licensePlate && (
              <Text style={styles.infoTextSmall}>Plate: {data.vehicle.licensePlate}</Text>
            )}
            {data.mileage && (
              <Text style={styles.infoTextSmall}>Mileage: {data.mileage.toLocaleString()}</Text>
            )}
          </View>
          {data.vehicle.customer && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Customer</Text>
              <Text style={styles.infoTextBold}>{data.vehicle.customer.name}</Text>
              {data.vehicle.customer.email && (
                <Text style={styles.infoTextSmall}>{data.vehicle.customer.email}</Text>
              )}
              {data.vehicle.customer.phone && (
                <Text style={styles.infoTextSmall}>{data.vehicle.customer.phone}</Text>
              )}
            </View>
          )}
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Inspection Details</Text>
            <Text style={styles.infoTextBold}>{data.template.name}</Text>
            <Text style={styles.infoTextSmall}>
              Status: {data.status === 'completed' ? 'Completed' : 'In Progress'}
            </Text>
          </View>
        </View>

        {/* Summary bar */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginBottom: 16,
            marginTop: 4,
          }}
        >
          <View
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#f3f4f6',
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: fontBold }}>{totalInspected}</Text>
            <Text style={{ fontSize: 7, color: gray }}>Inspected</Text>
          </View>
          <View
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#dcfce7',
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: '#166534' }}>
              {passCount}
            </Text>
            <Text style={{ fontSize: 7, color: '#166534' }}>Pass</Text>
          </View>
          <View
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#fef9c3',
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: '#854d0e' }}>
              {attentionCount}
            </Text>
            <Text style={{ fontSize: 7, color: '#854d0e' }}>Attention</Text>
          </View>
          <View
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#fee2e2',
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: fontBold, color: '#991b1b' }}>
              {failCount}
            </Text>
            <Text style={{ fontSize: 7, color: '#991b1b' }}>Fail</Text>
          </View>
        </View>

        {/* Sections with items */}
        {sectionOrder.map((sectionName) => (
          <View key={sectionName} style={{ marginBottom: 12 }} wrap={false}>
            <Text style={styles.sectionTitle}>{sectionName}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>Item</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>Status</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '40%' }}>Notes</Text>
              </View>
              {sections[sectionName].map((item, i) => {
                const cond = conditionColors[item.condition]
                return (
                  <View key={i} style={styles.tableRow}>
                    <Text style={{ ...styles.tableCell, width: '45%' }}>{item.name}</Text>
                    <View style={{ width: '15%', flexDirection: 'row' }}>
                      {cond ? (
                        <View
                          style={{
                            backgroundColor: cond.bg,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 3,
                          }}
                        >
                          <Text style={{ fontSize: 7, color: cond.text, fontFamily: fontBold }}>
                            {cond.label}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 9, color: gray }}>—</Text>
                      )}
                    </View>
                    <Text style={{ ...styles.tableCell, width: '40%', color: gray }}>
                      {item.notes || ''}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ))}

        {/* Portal URL */}
        {portalUrl && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
              View your portal: {portalUrl}
            </Text>
          </View>
        )}

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
              Vehicle Inspection — {shopName} ·{' '}
            </Text>
            <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>Vehicle Inspection — {shopName}</Text>
        )}
      </Page>
    </Document>
  )
}
