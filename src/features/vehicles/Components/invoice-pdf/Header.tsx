import { Text, View, Image } from '@react-pdf/renderer'
import type { WorkshopInfo, InvoiceSettingsProps } from './types'
import { gray, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'
import { getOrderedFieldIds } from '@/features/settings/Schema/invoiceLayoutSchema'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

const DEFAULT_HEADER_FIELD_ORDER = ['logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_org_number']

interface HeaderProps {
  headerStyle: string
  primaryColor: string
  fontFamily: string
  showLogo: boolean
  showCompanyName: boolean
  /** When provided by layoutConfig, takes priority over showLogo/showCompanyName */
  visibleFields?: Set<string> | null
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  shopDisplayName: string
  invoiceNum: string
  serviceDate: string
  dueDate: string | null
  logoSize?: number
  styles: Record<string, Style>
  labels: Record<string, string>
}

export function Header({
  headerStyle,
  primaryColor,
  fontFamily,
  showLogo: showLogoProp,
  showCompanyName: showCompanyNameProp,
  visibleFields,
  logoDataUri,
  torqvoiceLogoDataUri,
  workshop,
  invoiceSettings,
  shopDisplayName,
  invoiceNum,
  serviceDate,
  dueDate,
  logoSize,
  styles,
  labels,
}: HeaderProps) {
  const fontBold = getFontBold(fontFamily)

  // Logo size scale factor (default 100 = 1x)
  const scale = (logoSize || 100) / 100

  // When visibleFields is provided (from layoutConfig), getOrderedFieldIds
  // returns only the visible fields in the configured order.
  // When not provided, falls back to default order with legacy prop checks.
  const fieldOrder = getOrderedFieldIds(visibleFields, DEFAULT_HEADER_FIELD_ORDER)

  // For legacy prop fallback (no layoutConfig)
  const showLogo = visibleFields ? fieldOrder.includes('logo') : showLogoProp
  const showCompanyName = visibleFields ? fieldOrder.includes('company_name') : showCompanyNameProp

  if (headerStyle === 'compact') {
    const renderCompactField = (fieldId: string) => {
      switch (fieldId) {
        case 'logo':
          return showLogo && logoDataUri ? (
            <Image
              key="logo"
              src={logoDataUri}
              style={{ maxWidth: 40 * scale, maxHeight: 40 * scale, borderRadius: 4, objectFit: 'contain', marginBottom: 4 }}
            />
          ) : null
        case 'company_name':
          return showCompanyName ? (
            <Text key="company_name" style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
              {shopDisplayName}
            </Text>
          ) : null
        case 'company_address':
          return workshop?.address ? (
            <Text key="company_address" style={{ fontSize: 8, color: gray }}>{workshop.address}</Text>
          ) : null
        case 'company_phone':
          return workshop?.phone ? (
            <Text key="company_phone" style={{ fontSize: 8, color: gray }}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>
          ) : null
        case 'company_email':
          return workshop?.email ? (
            <Text key="company_email" style={{ fontSize: 8, color: gray }}>{workshop.email}</Text>
          ) : null
        case 'company_org_number':
          return invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber ? (
            <Text key="company_org_number" style={{ fontSize: 8, color: gray }}>{labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}</Text>
          ) : null
        default:
          return null
      }
    }

    return (
      <View style={{ marginBottom: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#e5e7eb',
          }}
        >
          <View>
            {fieldOrder.map(renderCompactField)}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontFamily: fontBold }}>{labels.title || 'INVOICE'}</Text>
            <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{invoiceNum}</Text>
            <Text style={{ fontSize: 9, color: gray }}>{serviceDate}</Text>
            {dueDate && <Text style={{ fontSize: 9, color: gray }}>{labels.due ? fillTemplate(labels.due, { date: dueDate }) : `Due: ${dueDate}`}</Text>}
          </View>
        </View>
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 3,
              marginTop: 6,
              paddingHorizontal: 2,
            }}
          >
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
      </View>
    )
  }

  if (headerStyle === 'modern') {
    const renderModernField = (fieldId: string) => {
      switch (fieldId) {
        case 'logo':
          return showLogo && logoDataUri ? (
            <Image
              key="logo"
              src={logoDataUri}
              style={{
                maxWidth: 50 * scale,
                maxHeight: 50 * scale,
                borderRadius: 4,
                objectFit: 'contain',
                marginBottom: 6,
              }}
            />
          ) : null
        case 'company_name':
          return showCompanyName ? (
            <Text key="company_name" style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>
              {shopDisplayName}
            </Text>
          ) : null
        case 'company_address':
          return workshop?.address ? (
            <Text key="company_address" style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {workshop.address}
            </Text>
          ) : null
        case 'company_phone':
          return workshop?.phone ? (
            <Text key="company_phone" style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
            </Text>
          ) : null
        case 'company_email':
          return workshop?.email ? (
            <Text key="company_email" style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {workshop.email}
            </Text>
          ) : null
        case 'company_org_number':
          return invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber ? (
            <Text key="company_org_number" style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}
            </Text>
          ) : null
        default:
          return null
      }
    }

    return (
      <View style={{ marginBottom: 24 }}>
        <View
          style={{
            backgroundColor: primaryColor,
            padding: 20,
            borderRadius: 4,
            marginHorizontal: -10,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            {fieldOrder.map(renderModernField)}
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
          <Text style={{ fontSize: 18, fontFamily: fontBold }}>{labels.title || 'INVOICE'}</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Text style={{ fontSize: 9, color: gray }}>{invoiceNum}</Text>
            <Text style={{ fontSize: 9, color: gray }}>{serviceDate}</Text>
            {dueDate && <Text style={{ fontSize: 9, color: gray }}>{labels.due ? fillTemplate(labels.due, { date: dueDate }) : `Due: ${dueDate}`}</Text>}
          </View>
        </View>
      </View>
    )
  }

  // Standard header (default)
  const renderStandardField = (fieldId: string) => {
    switch (fieldId) {
      case 'logo':
        return showLogo && logoDataUri ? (
          <Image
            key="logo"
            src={logoDataUri}
            style={{
              maxWidth: 150 * scale,
              maxHeight: 60 * scale,
              marginBottom: 6,
              borderRadius: 4,
              objectFit: 'contain',
              objectPosition: 'left',
            }}
          />
        ) : null
      case 'company_name':
        return showCompanyName ? <Text key="company_name" style={styles.brandName}>{shopDisplayName}</Text> : null
      case 'company_address':
        return workshop?.address ? (
          <Text key="company_address" style={styles.brandSub}>{workshop.address}</Text>
        ) : (
          <Text key="company_address" style={styles.brandSub}>{labels.professionalWorkshop || 'Professional Workshop Management'}</Text>
        )
      case 'company_phone':
        return workshop?.phone ? (
          <Text key="company_phone" style={styles.brandContact}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>
        ) : null
      case 'company_email':
        return workshop?.email ? (
          <Text key="company_email" style={styles.brandContact}>{workshop.email}</Text>
        ) : null
      case 'company_org_number':
        return invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber ? (
          <Text key="company_org_number" style={styles.brandContact}>{labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}</Text>
        ) : null
      default:
        return null
    }
  }

  return (
    <View style={styles.header}>
      <View>
        {fieldOrder.map(renderStandardField)}
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              gap: 3,
              marginBottom: 6,
            }}
          >
            <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
            <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
      </View>
      <View>
        <Text style={styles.invoiceTitle}>{labels.title || 'INVOICE'}</Text>
        <Text style={styles.invoiceNumber}>{invoiceNum}</Text>
        <Text style={styles.invoiceNumber}>{serviceDate}</Text>
        {dueDate && <Text style={styles.invoiceNumber}>{labels.due ? fillTemplate(labels.due, { date: dueDate }) : `Due: ${dueDate}`}</Text>}
      </View>
    </View>
  )
}
