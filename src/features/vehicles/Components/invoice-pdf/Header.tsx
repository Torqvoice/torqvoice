import { Text, View, Image } from '@react-pdf/renderer'
import type { WorkshopInfo, InvoiceSettingsProps } from './types'
import { gray, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface HeaderProps {
  headerStyle: string
  primaryColor: string
  fontFamily: string
  showLogo: boolean
  showCompanyName: boolean
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  shopDisplayName: string
  invoiceNum: string
  serviceDate: string
  dueDate: string | null
  styles: Record<string, Style>
  labels: Record<string, string>
}

export function Header({
  headerStyle,
  primaryColor,
  fontFamily,
  showLogo,
  showCompanyName,
  logoDataUri,
  torqvoiceLogoDataUri,
  workshop,
  invoiceSettings,
  shopDisplayName,
  invoiceNum,
  serviceDate,
  dueDate,
  styles,
  labels,
}: HeaderProps) {
  const fontBold = getFontBold(fontFamily)

  if (headerStyle === 'compact') {
    return (
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
                  {shopDisplayName}
                </Text>
                {workshop?.address && (
                  <Text style={{ fontSize: 8, color: gray }}>{workshop.address}</Text>
                )}
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontFamily: fontBold }}>{labels.title || 'INVOICE'}</Text>
            <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{invoiceNum}</Text>
            <Text style={{ fontSize: 9, color: gray }}>{serviceDate}</Text>
            {dueDate && <Text style={{ fontSize: 9, color: gray }}>{labels.due ? fillTemplate(labels.due, { date: dueDate }) : `Due: ${dueDate}`}</Text>}
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
              <Text style={{ fontSize: 8, color: gray }}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>
            )}
            {workshop?.email && (
              <Text style={{ fontSize: 8, color: gray }}>{workshop.email}</Text>
            )}
            {invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber && (
              <Text style={{ fontSize: 8, color: gray }}>{labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}</Text>
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
  }

  if (headerStyle === 'modern') {
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
                style={{
                  maxWidth: 50,
                  maxHeight: 50,
                  borderRadius: 4,
                  objectFit: 'contain',
                }}
              />
            )}
            <View style={{ alignItems: 'center' }}>
              {showCompanyName && (
                <Text style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>
                  {shopDisplayName}
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
                    {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
                  </Text>
                )}
                {workshop?.email && (
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                    {workshop.email}
                  </Text>
                )}
                {invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber && (
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                    {labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}
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
  return (
    <View style={styles.header}>
      <View>
        {showLogo && logoDataUri && (
          <Image
            src={logoDataUri}
            style={{
              maxWidth: 150,
              maxHeight: 60,
              marginBottom: 6,
              borderRadius: 4,
              objectFit: 'contain',
              objectPosition: 'left',
            }}
          />
        )}
        {showCompanyName && <Text style={styles.brandName}>{shopDisplayName}</Text>}
        {workshop?.address ? (
          <Text style={styles.brandSub}>{workshop.address}</Text>
        ) : (
          <Text style={styles.brandSub}>{labels.professionalWorkshop || 'Professional Workshop Management'}</Text>
        )}
        {workshop?.phone && <Text style={styles.brandContact}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>}
        {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
        {invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber && (
          <Text style={styles.brandContact}>{labels.org ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber }) : `Org: ${invoiceSettings.orgNumber}`}</Text>
        )}
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
