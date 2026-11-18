import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
import {
  DESIGNER_LAYOUT_VERSION,
  type InvoiceLayoutConfig,
  invoiceLayoutConfigSchema,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * The template a new workshop's invoices and quotes start on: Compact, the
 * dense one-page sheet. Workshops made before this keep whatever they print
 * now; only a workshop made by onboarding gets these settings, and it can
 * pick any other template in Settings, Templates.
 */
export const STARTER_PRESET_ID = 'compact'

function starterPreset() {
  const preset = layoutPresets.find((p) => p.id === STARTER_PRESET_ID)
  if (!preset) throw new Error(`Starter template "${STARTER_PRESET_ID}" is missing`)
  return preset
}

/**
 * The layout as the designer would save it, stamped so it prints as a
 * designer layout, with the title strip on. The Compact template leaves the
 * strip out, and a sheet without it prints no title, no number and no dates.
 * Only new workshops get this; the template itself is left as it is, so no
 * existing workshop changes.
 */
export function starterLayout(): InvoiceLayoutConfig {
  const layout = buildLayoutFromPreset(starterPreset())
  const ordered = [...layout.sections].sort((a, b) => a.order - b.order)
  const title = ordered.find((s) => s.id === 'document_title')
  const rest = ordered.filter((s) => s !== title)
  if (title)
    rest.splice(rest.findIndex((s) => s.id === 'header') + 1, 0, { ...title, visible: true })
  return invoiceLayoutConfigSchema.parse({
    ...layout,
    sections: rest.map((s, order) => ({ ...s, order })),
    version: DESIGNER_LAYOUT_VERSION,
  })
}

/** The look and layout together, as the print builders take them. */
export function starterTemplate(): TemplateConfig {
  const { template } = starterPreset()
  return {
    primaryColor: template.primaryColor,
    headerStyle: template.headerStyle,
    fontFamily: template.fontFamily,
    layoutConfig: starterLayout(),
  }
}

/**
 * The settings rows that make the starter template the workshop's own, for
 * invoices and quotes: the same keys the designer writes when a template is
 * saved, with the template marked as the one in use.
 */
export function starterDesignSettings(): Record<string, string> {
  const { template } = starterPreset()
  const layout = JSON.stringify(starterLayout())
  const rows: Record<string, string> = {
    [SETTING_KEYS.INVOICE_LAYOUT_CONFIG]: layout,
    [SETTING_KEYS.QUOTE_LAYOUT_CONFIG]: layout,
  }
  for (const prefix of ['invoice', 'quote']) {
    rows[`${prefix}.primaryColor`] = template.primaryColor
    rows[`${prefix}.headerStyle`] = template.headerStyle
    rows[`${prefix}.fontFamily`] = template.fontFamily
    rows[`${prefix}.activeDesign`] = `preset:${STARTER_PRESET_ID}`
  }
  return rows
}
