import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from '@/features/vehicles/Components/invoice-pdf/styles'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  countConditions,
  deriveTestResult,
  formatRange,
  isDefect,
  type Condition,
} from '../Lib/conditions'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface InspectionItem {
  name: string
  section: string
  condition: string
  notes: string | null
  sortOrder: number
  code?: string | null
  sectionCode?: string | null
  inputType?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  measuredValue?: number | null
  textValue?: string | null
}

interface InspectionData {
  id: string
  status: string
  mileage: number | null
  notes: string | null
  createdAt: Date
  completedAt: Date | null
  vehicleCategory?: string | null
  nextTestDue?: Date | null
  certificateNumber?: string | null
  inspectorName?: string | null
  testLocation?: string | null
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
  template: { name: string; severityScale?: string | null; country?: string | null }
  items: InspectionItem[]
}

interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
}

/** English fallbacks for the labels the PDF route passes in from pdf.json. */
const FALLBACK: Record<string, string> = {
  euPass: 'No defect',
  euAttention: 'Minor defect',
  euFail: 'Major defect',
  euDangerous: 'Dangerous defect',
  basicPass: 'Pass',
  basicAttention: 'Attention',
  basicFail: 'Fail',
  basicDangerous: 'Dangerous',
  resultPass: 'Pass',
  resultPassMinor: 'Pass with minor defects',
  resultFail: 'Fail — major defects',
  resultFailDangerous: 'Fail — dangerous defects',
  resultIncomplete: 'Not completed',
  overallResult: 'Result of the test',
  testDetails: 'Test details',
  testDate: 'Date of test',
  testLocation: 'Place of test',
  inspector: 'Inspector',
  certificateNumber: 'Certificate number',
  vehicleCategory: 'Vehicle category',
  nextTestDue: 'Next test due',
  deficiencies: 'Deficiencies found',
  reading: 'Reading',
  limit: 'Limit',
  noDeficiencies: 'No deficiencies were recorded.',
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
  labels = {},
}: {
  data: InspectionData
  workshop?: WorkshopInfo
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  portalUrl?: string
  labels?: Record<string, string>
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
  const testDate = formatDateForPdf(data.completedAt ?? data.createdAt, df, tz)
  const shopName = workshop?.name || 'Torqvoice'

  const label = (key: string) => labels[key] || FALLBACK[key] || key
  const isBasic = data.template.severityScale === 'basic'
  const conditionText = (condition: Condition) => {
    const suffix = condition.charAt(0).toUpperCase() + condition.slice(1)
    return label(`${isBasic ? 'basic' : 'eu'}${suffix}`)
  }

  const gradedItems = data.items
    .filter((i) => i.condition !== 'not_inspected')
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const sectionOrder: string[] = []
  const sections: Record<string, InspectionItem[]> = {}
  for (const item of gradedItems) {
    if (!sections[item.section]) {
      sections[item.section] = []
      sectionOrder.push(item.section)
    }
    sections[item.section].push(item)
  }

  const counts = countConditions(gradedItems)
  const result = deriveTestResult(gradedItems)
  const resultToken = TEST_RESULT_TOKENS[result]
  const resultLabelKey = {
    pass: 'resultPass',
    pass_minor: 'resultPassMinor',
    fail: 'resultFail',
    fail_dangerous: 'resultFailDangerous',
    incomplete: 'resultIncomplete',
  }[result]
  const resultDetailKey = {
    pass: 'resultDetailPass',
    pass_minor: 'resultDetailPassMinor',
    fail: 'resultDetailFail',
    fail_dangerous: 'resultDetailFailDangerous',
    incomplete: 'resultDetailIncomplete',
  }[result]
  const deficiencies = gradedItems.filter((i) => isDefect(i.condition))

  /** "2.4 mm · Limit: min 3 mm" — the recorded value next to its allowed range. */
  const valueText = (item: InspectionItem): string | null => {
    if (item.inputType === 'measurement' && item.measuredValue !== null && item.measuredValue !== undefined) {
      const range = formatRange(item)
      const reading = `${item.measuredValue}${item.unit ? ` ${item.unit}` : ''}`
      return range ? `${reading} · ${label('limit')}: ${range}` : reading
    }
    return item.textValue || null
  }

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
            {labels.title || 'VEHICLE INSPECTION'}
          </Text>
          <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{testDate}</Text>
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
            <Text style={{ fontSize: 8, color: gray }}>
              {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
            </Text>
          )}
          {workshop?.email && <Text style={{ fontSize: 8, color: gray }}>{workshop.email}</Text>}
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
        style={{ backgroundColor: primaryColor, padding: 20, borderRadius: 4, marginHorizontal: -10 }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}
        >
          {showLogo && logoDataUri && (
            <Image
              src={logoDataUri}
              style={{ maxWidth: 50, maxHeight: 50, borderRadius: 4, objectFit: 'contain' }}
            />
          )}
          <View style={{ alignItems: 'center' }}>
            {showCompanyName && (
              <Text style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>{shopName}</Text>
            )}
            {workshop?.address && (
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {workshop.address}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {workshop?.phone && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                  {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
                </Text>
              )}
              {workshop?.email && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>{workshop.email}</Text>
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
          {labels.title || 'VEHICLE INSPECTION'}
        </Text>
        <Text style={{ fontSize: 9, color: gray }}>{testDate}</Text>
      </View>
    </View>
  )

  const renderStandardHeader = () => (
    <View style={styles.header}>
      <View>
        {showLogo && logoDataUri && (
          <Image src={logoDataUri} style={{ width: 60, height: 60, marginBottom: 6, borderRadius: 4 }} />
        )}
        {showCompanyName && <Text style={styles.brandName}>{shopName}</Text>}
        {workshop?.address && <Text style={styles.brandSub}>{workshop.address}</Text>}
        {workshop?.phone && (
          <Text style={styles.brandContact}>
            {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
          </Text>
        )}
        {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
      </View>
      <View>
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 3,
              marginBottom: 6,
            }}
          >
            <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
            <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
        <Text style={{ ...styles.invoiceTitle, color: primaryColor }}>
          {labels.title || 'VEHICLE INSPECTION'}
        </Text>
        <Text style={styles.invoiceNumber}>{data.template.name}</Text>
        <Text style={styles.invoiceNumber}>{testDate}</Text>
      </View>
    </View>
  )

  /** Annex IV rows that only appear once the workshop has filled them in. */
  const certificateRows: { label: string; value: string }[] = [
    { label: label('testDate'), value: testDate },
    ...(data.certificateNumber
      ? [{ label: label('certificateNumber'), value: data.certificateNumber }]
      : []),
    ...(data.vehicleCategory
      ? [{ label: label('vehicleCategory'), value: data.vehicleCategory }]
      : []),
    ...(data.inspectorName ? [{ label: label('inspector'), value: data.inspectorName }] : []),
    ...(data.testLocation || workshop?.address
      ? [{ label: label('testLocation'), value: data.testLocation || workshop?.address || '' }]
      : []),
    ...(data.nextTestDue
      ? [{ label: label('nextTestDue'), value: formatDateForPdf(data.nextTestDue, df, tz) }]
      : []),
  ]

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerStyle === 'compact'
          ? renderCompactHeader()
          : headerStyle === 'modern'
            ? renderModernHeader()
            : renderStandardHeader()}

        {/* Overall result — Annex IV(g) */}
        <View
          style={{
            backgroundColor: resultToken.pdf.bg,
            borderRadius: 4,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 8, color: resultToken.pdf.text, marginBottom: 2 }}>
            {label('overallResult')}
          </Text>
          <Text style={{ fontSize: 15, fontFamily: fontBold, color: resultToken.pdf.text }}>
            {label(resultLabelKey)}
          </Text>
          <Text style={{ fontSize: 8, color: resultToken.pdf.text, marginTop: 3 }}>
            {labels[resultDetailKey] || resultToken.detail}
          </Text>
        </View>

        {/* Vehicle, customer and test details — Annex IV(a)–(e), (i) */}
        <View style={styles.infoRow}>
          <View style={{ ...styles.infoBox, flex: 1 }}>
            <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
            <Text style={styles.infoTextBold}>
              {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
            </Text>
            {data.vehicle.vin && (
              <Text style={styles.infoTextSmall}>
                {labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}
              </Text>
            )}
            {data.vehicle.licensePlate && (
              <Text style={styles.infoTextSmall}>
                {labels.plate
                  ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate })
                  : `Plate: ${data.vehicle.licensePlate}`}
              </Text>
            )}
            {data.mileage !== null && (
              <Text style={styles.infoTextSmall}>
                {labels.mileage
                  ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() })
                  : `Mileage: ${data.mileage.toLocaleString()}`}
              </Text>
            )}
            {data.vehicle.customer && (
              <Text style={{ ...styles.infoTextSmall, marginTop: 4 }}>
                {labels.customer || 'Customer'}: {data.vehicle.customer.name}
              </Text>
            )}
          </View>

          <View style={{ ...styles.infoBox, flex: 1 }}>
            <Text style={styles.infoLabel}>{label('testDetails')}</Text>
            {certificateRows.map((row) => (
              <Text key={row.label} style={styles.infoTextSmall}>
                {row.label}: {row.value}
              </Text>
            ))}
            <Text style={{ ...styles.infoTextSmall, marginTop: 4 }}>{data.template.name}</Text>
          </View>
        </View>

        {/* Deficiency counts */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, marginTop: 4 }}>
          {(
            [
              { key: 'inspected' as const, value: counts.inspected, bg: '#f3f4f6', color: '#374151', text: labels.inspected || 'Inspected' },
              { key: 'pass' as const, value: counts.pass, ...CONDITION_TOKENS.pass.pdf, text: conditionText('pass') },
              { key: 'attention' as const, value: counts.attention, ...CONDITION_TOKENS.attention.pdf, text: conditionText('attention') },
              { key: 'fail' as const, value: counts.fail, ...CONDITION_TOKENS.fail.pdf, text: conditionText('fail') },
              ...(isBasic
                ? []
                : [
                    {
                      key: 'dangerous' as const,
                      value: counts.dangerous,
                      ...CONDITION_TOKENS.dangerous.pdf,
                      text: conditionText('dangerous'),
                    },
                  ]),
            ] as { key: string; value: number; bg?: string; text: string; color?: string }[]
          ).map((tile) => (
            <View
              key={tile.key}
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: tile.bg || '#f3f4f6',
                borderRadius: 4,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: fontBold, color: tile.color || '#374151' }}>
                {tile.value}
              </Text>
              <Text style={{ fontSize: 6.5, color: tile.color || '#374151', textAlign: 'center' }}>
                {tile.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Deficiencies — Annex IV(f) */}
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.sectionTitle}>
            {label('deficiencies')} ({deficiencies.length})
          </Text>
          {deficiencies.length === 0 ? (
            <Text style={{ fontSize: 9, color: gray }}>{label('noDeficiencies')}</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '12%' }}>#</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '33%' }}>{labels.item || 'Item'}</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%' }}>
                  {labels.statusColumn || 'Status'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>
                  {labels.notesColumn || 'Notes'}
                </Text>
              </View>
              {deficiencies.map((item, i) => {
                const token = CONDITION_TOKENS[item.condition as Condition]
                const value = valueText(item)
                return (
                  <View key={i} style={styles.tableRow}>
                    <Text style={{ ...styles.tableCell, width: '12%', color: gray }}>
                      {item.code || '—'}
                    </Text>
                    <View style={{ width: '33%' }}>
                      <Text style={styles.tableCell}>{item.name}</Text>
                      {value && (
                        <Text style={{ fontSize: 7, color: gray, marginTop: 1 }}>{value}</Text>
                      )}
                    </View>
                    <View style={{ width: '20%', flexDirection: 'row' }}>
                      <View
                        style={{
                          backgroundColor: token.pdf.bg,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 3,
                        }}
                      >
                        <Text style={{ fontSize: 6.5, color: token.pdf.text, fontFamily: fontBold }}>
                          {conditionText(item.condition as Condition)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ ...styles.tableCell, width: '35%', color: gray }}>
                      {item.notes || ''}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Full results by section */}
        {sectionOrder.map((sectionName) => (
          <View key={sectionName} style={{ marginBottom: 12 }} wrap={false}>
            <Text style={styles.sectionTitle}>
              {sections[sectionName][0]?.sectionCode
                ? `${sections[sectionName][0].sectionCode}. ${sectionName}`
                : sectionName}
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '10%' }}>#</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>{labels.item || 'Item'}</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%' }}>
                  {labels.statusColumn || 'Status'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>
                  {labels.notesColumn || 'Notes'}
                </Text>
              </View>
              {sections[sectionName].map((item, i) => {
                const token = CONDITION_TOKENS[item.condition as Condition]
                const value = valueText(item)
                return (
                  <View key={i} style={styles.tableRow}>
                    <Text style={{ ...styles.tableCell, width: '10%', color: gray }}>
                      {item.code || ''}
                    </Text>
                    <Text style={{ ...styles.tableCell, width: '35%' }}>{item.name}</Text>
                    <View style={{ width: '20%', flexDirection: 'row' }}>
                      {token ? (
                        <View
                          style={{
                            backgroundColor: token.pdf.bg,
                            paddingHorizontal: 5,
                            paddingVertical: 2,
                            borderRadius: 3,
                          }}
                        >
                          <Text
                            style={{ fontSize: 6.5, color: token.pdf.text, fontFamily: fontBold }}
                          >
                            {conditionText(item.condition as Condition)}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 9, color: gray }}>—</Text>
                      )}
                    </View>
                    <View style={{ width: '35%' }}>
                      {value && <Text style={{ fontSize: 8 }}>{value}</Text>}
                      {item.notes && (
                        <Text style={{ ...styles.tableCell, color: gray }}>{item.notes}</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        ))}

        {portalUrl && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
              {labels.viewPortal
                ? fillTemplate(labels.viewPortal, { url: portalUrl })
                : `View your portal: ${portalUrl}`}
            </Text>
          </View>
        )}

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
              {labels.footerText
                ? fillTemplate(labels.footerText, { shopName })
                : `Vehicle Inspection — ${shopName}`}{' '}
              ·{' '}
            </Text>
            <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>
            {labels.footerText
              ? fillTemplate(labels.footerText, { shopName })
              : `Vehicle Inspection — ${shopName}`}
          </Text>
        )}
      </Page>
    </Document>
  )
}
