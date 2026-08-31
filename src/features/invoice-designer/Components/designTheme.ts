import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import { frameShadowWidth } from '../Spec/buildSpec'
import type { DesignerTemplate } from './types'

/** Blend two hex colors, used to derive the secondary tone the PDF derives. */
export function mix(from: string, to: string, amount: number) {
  const parse = (hex: string) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [17, 24, 39]
  }
  const a = parse(from)
  const b = parse(to)
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount)
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`
}

/** The theme a designer template and layout resolve to, for the generator. */
export function themeOf(template: DesignerTemplate, layout: InvoiceLayoutConfig) {
  const doc = layout.document ?? {}
  const text = template.textColor || '#111827'
  const background = template.backgroundColor || '#ffffff'
  const banded = template.headerStyle === 'framed' || template.headerStyle === 'modern'
  return {
    primary: template.primaryColor,
    background,
    text,
    muted: template.textColor ? mix(text, background, 0.42) : '#6b7280',
    accent: doc.accentColor || template.primaryColor,
    companyText: template.companyTextColor || (banded ? '#ffffff' : template.primaryColor),
    fontFamily: doc.fontFamily || template.fontFamily,
    fontSize: doc.fontSize ?? BASE_FONT_SIZE,
    margin: doc.margin ?? 40,
    rowPadding: doc.rowPadding ?? 5,
    stripes: doc.stripes !== false,
    stripeColor: doc.stripeColor || mix(background, text, 0.045),
    headerStyle: template.headerStyle,
    frameSide: template.frameSide === 'right' ? ('right' as const) : ('left' as const),
    frameBorderColor: template.frameBorderColor || undefined,
    frameShadow: frameShadowWidth(template.frameShadow),
    frameRadius: template.frameRadius,
    logoSize: template.logoSize,
  }
}
