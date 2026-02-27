import { Text, View, Image } from '@react-pdf/renderer'
import type { InvoiceSettingsProps } from './types'
import { gray, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface FooterProps {
  shopDisplayName: string
  serviceDate: string
  invoiceSettings?: InvoiceSettingsProps
  invoiceNum: string
  primaryColor: string
  fontFamily: string
  torqvoiceLogoDataUri?: string
  paymentTerms?: string
  portalUrl?: string
  styles: Record<string, Style>
  labels: Record<string, string>
}

export function Footer({
  shopDisplayName,
  serviceDate,
  invoiceSettings,
  fontFamily,
  torqvoiceLogoDataUri,
  portalUrl,
  styles,
  labels,
}: FooterProps) {
  const fontBold = getFontBold(fontFamily)

  return (
    <>
      {portalUrl && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
            {labels.viewPortal ? fillTemplate(labels.viewPortal, { url: portalUrl }) : `View your portal: ${portalUrl}`}
          </Text>
        </View>
      )}

      {invoiceSettings?.paymentTerms && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, color: gray }}>
            {labels.paymentTerms ? fillTemplate(labels.paymentTerms, { terms: invoiceSettings.paymentTerms }) : `Payment Terms: ${invoiceSettings.paymentTerms}`}
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
          {invoiceSettings?.footerNote ? (
            <Text style={{ fontSize: 8, color: gray }}>{invoiceSettings.footerNote} · </Text>
          ) : null}
          <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
          <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
          <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
        </View>
      ) : (
        <Text style={styles.footer}>
          {invoiceSettings?.footerNote || `${shopDisplayName} · ${serviceDate}`}
        </Text>
      )}
    </>
  )
}

export function AttachmentsFooter({
  shopDisplayName,
  invoiceNum,
  styles,
}: {
  shopDisplayName: string
  invoiceNum: string
  styles: Record<string, Style>
}) {
  return (
    <Text style={styles.footer}>
      {shopDisplayName} · {invoiceNum}
    </Text>
  )
}
