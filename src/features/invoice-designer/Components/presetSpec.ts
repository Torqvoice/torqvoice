import { buildLayoutFromPreset, type LayoutPreset } from '@/features/settings/Schema/layoutPresets'
import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import { buildDocumentSpec, frameShadowWidth, type DocumentData } from '../Spec/buildSpec'
import type { DocumentSpec } from '../Spec/documentSpec'

/**
 * What a gallery template would print, as a document spec.
 *
 * One resolver for every card that shows a template: the designer's gallery
 * and the template cards in settings draw from the same spec, so a template
 * cannot look like one thing in settings and another in the designer.
 */
export function specForPreset(preset: LayoutPreset, data: DocumentData): DocumentSpec {
  return buildDocumentSpec(
    buildLayoutFromPreset(preset),
    {
      primary: preset.template.primaryColor,
      background: preset.template.backgroundColor || '#ffffff',
      text: preset.template.textColor || '#111827',
      muted: '#6b7280',
      accent: preset.document?.accentColor || preset.template.primaryColor,
      companyText:
        preset.template.headerStyle === 'framed' || preset.template.headerStyle === 'modern'
          ? '#ffffff'
          : preset.template.primaryColor,
      fontFamily: preset.template.fontFamily,
      fontSize: preset.document?.fontSize ?? BASE_FONT_SIZE,
      margin: preset.document?.margin ?? 40,
      rowPadding: preset.document?.rowPadding ?? 5,
      stripes: preset.document?.stripes !== false,
      stripeColor: preset.document?.stripeColor || '#f3f4f6',
      headerStyle: preset.template.headerStyle,
      frameSide: preset.template.frameSide ?? 'left',
      frameShadow: frameShadowWidth(undefined),
      frameRadius: 0,
      logoSize: 100,
    },
    data
  )
}
