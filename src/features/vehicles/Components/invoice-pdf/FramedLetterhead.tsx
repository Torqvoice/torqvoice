import { Text, View, Image } from '@react-pdf/renderer'
import { gray, getFontBold, FRAMED } from './styles'
import type { WorkshopInfo } from './types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * The letterhead of a framed sheet: a full-bleed color band across the top with
 * the workshop's name or logo set into it, and the contact details on the white
 * below, right-aligned under the name the way printed stationery sets them.
 *
 * It pulls itself out of the page padding with negative margins, so it has to
 * be the first block on the page and its numbers come from `FRAMED`. The rail
 * down the left edge is drawn by the page, not here.
 */
export function FramedLetterhead({
  primaryColor,
  fontFamily,
  showLogo,
  showCompanyName,
  fieldOrder,
  logoDataUri,
  logoScale = 1,
  workshop,
  orgNumber,
  shopDisplayName,
  labels,
}: {
  primaryColor: string
  fontFamily: string
  showLogo: boolean
  showCompanyName: boolean
  fieldOrder: string[]
  logoDataUri?: string
  logoScale?: number
  workshop?: WorkshopInfo
  orgNumber?: string | null
  shopDisplayName: string
  labels: Record<string, string>
}) {
  const fontBold = getFontBold(fontFamily)

  const strapline = ['company_address', 'company_phone', 'company_email', 'company_org_number']
    .filter((id) => fieldOrder.includes(id))
    .map((id) => {
      switch (id) {
        case 'company_address':
          return workshop?.address
        case 'company_phone':
          return workshop?.phone
            ? labels.tel
              ? fillTemplate(labels.tel, { phone: workshop.phone })
              : `Tel: ${workshop.phone}`
            : null
        case 'company_email':
          return workshop?.email
        case 'company_org_number':
          return orgNumber
            ? labels.org
              ? fillTemplate(labels.org, { org: orgNumber })
              : `Org: ${orgNumber}`
            : null
        default:
          return null
      }
    })
    .filter(Boolean)
    .join('  ·  ')

  return (
    <View
      style={{
        marginTop: -FRAMED.padTop,
        marginLeft: -FRAMED.padLeft,
        marginRight: -FRAMED.padRight,
        marginBottom: 20,
      }}
    >
      <View
        style={{
          height: FRAMED.bandHeight,
          backgroundColor: primaryColor,
          justifyContent: 'center',
          alignItems: 'flex-end',
          paddingRight: 26,
          paddingLeft: FRAMED.railWidth + 12,
        }}
      >
        {showLogo && logoDataUri ? (
          <Image
            src={logoDataUri}
            style={{
              maxWidth: 150 * logoScale,
              maxHeight: (FRAMED.bandHeight - 16) * logoScale,
              objectFit: 'contain',
            }}
          />
        ) : null}
        {showCompanyName ? (
          <Text style={{ fontSize: 24, fontFamily: fontBold, color: '#ffffff' }}>
            {shopDisplayName}
          </Text>
        ) : null}
      </View>

      {strapline ? (
        <View
          style={{
            paddingRight: 26,
            paddingLeft: FRAMED.railWidth + 12,
            paddingTop: 8,
            paddingBottom: 8,
            alignItems: 'flex-end',
            borderBottomWidth: 0.5,
            borderBottomColor: '#e5e7eb',
          }}
        >
          <Text style={{ fontSize: 9, color: gray }}>{strapline}</Text>
        </View>
      ) : null}
    </View>
  )
}
