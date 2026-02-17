import { Text, View, Image } from '@react-pdf/renderer'
import type { InvoiceSettingsProps } from './types'
import { gray, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

interface FooterProps {
  shopDisplayName: string
  serviceDate: string
  invoiceSettings?: InvoiceSettingsProps
  invoiceNum: string
  primaryColor: string
  fontFamily: string
  torqvoiceLogoDataUri?: string
  paymentTerms?: string
  styles: Record<string, Style>
}

export function Footer({
  shopDisplayName,
  serviceDate,
  invoiceSettings,
  fontFamily,
  torqvoiceLogoDataUri,
  styles,
}: FooterProps) {
  const fontBold = getFontBold(fontFamily)

  return (
    <>
      {invoiceSettings?.paymentTerms && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, color: gray }}>
            Payment Terms: {invoiceSettings.paymentTerms}
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
          <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
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
