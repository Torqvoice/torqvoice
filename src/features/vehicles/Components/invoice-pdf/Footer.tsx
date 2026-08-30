import { Text, View, Image } from '@react-pdf/renderer'
import type { InvoiceSettingsProps, WorkshopInfo } from './types'
import { gray, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * The footer's company details, grouped the way printed stationery groups them:
 * who the shop is, how to reach it, how to pay it. A column with nothing
 * visible in it is dropped, so a workshop that only wants a phone number gets a
 * phone number rather than two empty thirds.
 */
const FOOTER_COLUMNS = [
  ['company_name', 'company_address'],
  ['company_phone', 'company_email'],
  ['bank_account', 'company_org_number'],
] as const

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
  workshop?: WorkshopInfo
  /** When provided by layoutConfig, decides which company details print here. */
  visibleFields?: Set<string> | null
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
  workshop,
  visibleFields,
  styles,
  labels,
}: FooterProps) {
  const fontBold = getFontBold(fontFamily)

  const footerValue = (fieldId: string): string | null => {
    switch (fieldId) {
      case 'company_name':
        return shopDisplayName
      case 'company_address':
        return workshop?.address || null
      case 'company_phone':
        return workshop?.phone
          ? labels.tel
            ? fillTemplate(labels.tel, { phone: workshop.phone })
            : `Tel: ${workshop.phone}`
          : null
      case 'company_email':
        return workshop?.email || null
      case 'bank_account':
        return invoiceSettings?.bankAccount?.split(/\r?\n/).filter(Boolean).join(' · ') || null
      case 'company_org_number':
        return invoiceSettings?.orgNumber
          ? labels.org
            ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber })
            : `Org: ${invoiceSettings.orgNumber}`
          : null
      default:
        return null
    }
  }

  const columns = visibleFields
    ? FOOTER_COLUMNS.map((column) =>
        column
          .filter((fieldId) => visibleFields.has(fieldId))
          .map((fieldId) => ({ fieldId: fieldId as string, value: footerValue(fieldId) }))
          .filter((entry): entry is { fieldId: string; value: string } => !!entry.value)
      ).filter((column) => column.length > 0)
    : []

  const companyDetails =
    columns.length > 0 ? (
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
        {columns.map((column, i) => (
          <View key={i} style={{ flex: 1 }}>
            {column.map((entry) => (
              <Text
                key={entry.fieldId}
                style={{
                  fontSize: 7.5,
                  color: gray,
                  textAlign: 'left',
                  fontFamily: entry.fieldId === 'company_name' ? fontBold : undefined,
                }}
              >
                {entry.value}
              </Text>
            ))}
          </View>
        ))}
      </View>
    ) : null

  // The note is the footer every invoice has always had, and it only prints
  // when the layout still asks for it.
  const showNote = visibleFields ? visibleFields.has('footer_note') : true

  return (
    <>
      {portalUrl && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
            {labels.viewPortal
              ? fillTemplate(labels.viewPortal, { url: portalUrl })
              : `View your portal: ${portalUrl}`}
          </Text>
        </View>
      )}

      {/* Held together: the columns are short enough to look like one block,
          and react-pdf will otherwise break them mid-column, leaving the second
          line of each on the following page. */}
      <View wrap={false} style={styles.footer}>
        {companyDetails}
        {torqvoiceLogoDataUri ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {showNote && invoiceSettings?.footerNote ? (
              <Text style={{ fontSize: 8, color: gray }}>{invoiceSettings.footerNote} · </Text>
            ) : null}
            <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : showNote ? (
          <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
            {invoiceSettings?.footerNote || `${shopDisplayName} · ${serviceDate}`}
          </Text>
        ) : null}
      </View>
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
