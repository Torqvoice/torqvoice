import {
  buildLayoutFromPreset,
  certificatePresets,
  type PresetTemplate,
} from '@/features/settings/Schema/layoutPresets'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'

/**
 * The certificate a workshop gets until it designs its own: the Regulatory
 * preset, a plain form that lists every check with its grade and note. One
 * place, so the printed certificate and the designer's starting canvas agree.
 */
export const DEFAULT_CERTIFICATE_PRESET_ID = 'certificate-regulator'

export function defaultCertificateDesign(): {
  layout: InvoiceLayoutConfig
  template: PresetTemplate
} {
  const preset = certificatePresets.find((p) => p.id === DEFAULT_CERTIFICATE_PRESET_ID)
  if (!preset) throw new Error(`missing certificate preset ${DEFAULT_CERTIFICATE_PRESET_ID}`)
  return { layout: buildLayoutFromPreset(preset), template: preset.template }
}
