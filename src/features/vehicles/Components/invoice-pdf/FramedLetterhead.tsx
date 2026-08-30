import { Text, View, Image } from '@react-pdf/renderer'
import { gray, getFontBold, FRAMED, SHADOW, SHADOW_STEP } from './styles'
import type { WorkshopInfo } from './types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * What the band carries. A letterhead shows one mark: when a workshop has
 * uploaded a logo that logo is already its name set in its own type, and
 * printing the name beside it reads as a mistake.
 */
export function letterheadMark(opts: {
  showLogo: boolean
  logoDataUri?: string
  showCompanyName: boolean
}): 'logo' | 'name' | 'none' {
  if (opts.showLogo && opts.logoDataUri) return 'logo'
  return opts.showCompanyName ? 'name' : 'none'
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
  muted = gray,
  nameColor,
  borderColor,
  shadow = true,
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
  /** Secondary text color, so the strapline follows the chosen ink. */
  muted?: string
  /** The company name's color on the band. Unset is white. */
  nameColor?: string
  /** Line under the band where it meets the sheet. Unset means no line. */
  borderColor?: string
  /** Whether the band drops a shadow onto the sheet. */
  shadow?: boolean
  labels: Record<string, string>
}) {
  const fontBold = getFontBold(fontFamily)
  const mark = letterheadMark({ showLogo, logoDataUri, showCompanyName })

  const slogan = fieldOrder.includes('company_slogan') ? workshop?.slogan?.trim() : null

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
        // Out past the rail, not just past the padding: the band has to paint
        // over the page's left border or a hairline of white shows through
        // where the two rectangles meet.
        marginLeft: -(FRAMED.padLeft + FRAMED.railWidth),
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
          paddingLeft: FRAMED.railWidth + 26,
        }}
      >
        {mark === 'logo' ? (
          <Image
            src={logoDataUri}
            style={{
              maxWidth: 150 * logoScale,
              maxHeight: (FRAMED.bandHeight - 16) * logoScale,
              objectFit: 'contain',
            }}
          />
        ) : null}
        {mark === 'name' ? (
          <Text style={{ fontSize: 24, fontFamily: fontBold, color: nameColor || '#ffffff' }}>
            {shopDisplayName}
          </Text>
        ) : null}
      </View>

      {/* The band sits above the sheet, so it drops a shadow onto it. */}
      <View style={{ marginLeft: FRAMED.railWidth }}>
        {borderColor ? <View style={{ height: 0.6, backgroundColor: borderColor }} /> : null}
        {shadow
          ? SHADOW.map((color, i) => (
              <View key={i} style={{ height: SHADOW_STEP, backgroundColor: color }} />
            ))
          : null}
      </View>

      {slogan || strapline ? (
        <View
          style={{
            marginLeft: FRAMED.railWidth,
            paddingRight: 26,
            paddingLeft: 26,
            paddingTop: 8,
            paddingBottom: 8,
            alignItems: 'flex-end',
            borderBottomWidth: 0.5,
            borderBottomColor: '#e5e7eb',
          }}
        >
          {slogan ? <Text style={{ fontSize: 11, color: muted }}>{slogan}</Text> : null}
          {strapline ? (
            <Text style={{ fontSize: 9, color: muted, marginTop: slogan ? 3 : 0 }}>
              {strapline}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
