import { z } from 'zod'
import {
  invoiceLayoutConfigSchema,
  mergeWithDefaults,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
import type { DesignerTemplate, DocumentType, SavedDesign } from '../Components/types'
import { isDesignAutoRule } from './designRules'

/**
 * A design as something that can be printed from: the layout and the
 * template around it. Every design row, every snapshot and the workshop's
 * live settings reduce to this one shape, so the renderers never learn where
 * a look came from.
 *
 * The two letterhead switches ride along for layouts that predate the
 * designer, where the logo and the company name were settings rather than
 * header fields. The print builder still honours them when no layout was
 * saved, so they have to survive into a snapshot.
 */
export interface DesignSource {
  layout: Partial<InvoiceLayoutConfig>
  template: DesignerTemplate & { showLogo?: boolean; showCompanyName?: boolean }
}

/**
 * What a stored template must look like to be trusted. Lenient on purpose:
 * unknown keys pass through, so a field added to the designer later does not
 * make every earlier design unreadable, and each colour that was left blank
 * reads as blank rather than failing.
 */
export const designTemplateSchema = z
  .object({
    primaryColor: z.string().default('#d97706'),
    backgroundColor: z.string().default(''),
    textColor: z.string().default(''),
    companyTextColor: z.string().default(''),
    frameBorderColor: z.string().default(''),
    frameShadow: z.string().default('true'),
    frameSide: z.string().default('left'),
    frameRadius: z.number().default(0),
    fontFamily: z.string().default('Helvetica'),
    headerStyle: z.string().default('standard'),
    logoSize: z.number().default(100),
    logoUrl: z.string().default(''),
    showLogo: z.boolean().optional(),
    showCompanyName: z.boolean().optional(),
  })
  .passthrough()

export const DESIGN_DOCUMENT_TYPES: DocumentType[] = ['invoice', 'quote']

/** Reads a stored design row's JSON columns back into a source, or null. */
export function designSourceFromStored(layout: unknown, template: unknown): DesignSource | null {
  const parsedTemplate = designTemplateSchema.safeParse(template ?? {})
  if (!parsedTemplate.success) return null
  const parsedLayout = invoiceLayoutConfigSchema.partial().safeParse(layout ?? {})
  if (!parsedLayout.success) return null
  return { layout: parsedLayout.data, template: parsedTemplate.data }
}

function parseLayoutSetting(value: string | undefined): Partial<InvoiceLayoutConfig> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Partial<InvoiceLayoutConfig>) : {}
  } catch {
    return {}
  }
}

/**
 * The look the workshop's settings describe for one document: what every
 * renderer read before designs became rows, key for key, including the two
 * legacy `invoice.template.*` spellings the protected PDF route still fell
 * back to.
 */
export function designSourceFromSettings(
  settings: Record<string, string | undefined>,
  documentType: DocumentType
): DesignSource {
  const p = documentType
  return {
    layout: parseLayoutSetting(settings[`${p}.layoutConfig`]),
    template: {
      primaryColor:
        settings[`${p}.primaryColor`] || settings[`${p}.template.primaryColor`] || '#d97706',
      backgroundColor: settings[`${p}.backgroundColor`] || '',
      textColor: settings[`${p}.textColor`] || '',
      companyTextColor: settings[`${p}.companyTextColor`] || '',
      frameBorderColor: settings[`${p}.frameBorderColor`] || '',
      frameShadow: settings[`${p}.frameShadow`] || 'true',
      frameSide: settings[`${p}.frameSide`] === 'right' ? 'right' : 'left',
      frameRadius: Number(settings[`${p}.frameRadius`]) || 0,
      fontFamily:
        settings[`${p}.fontFamily`] || settings[`${p}.template.fontFamily`] || 'Helvetica',
      headerStyle:
        settings[`${p}.headerStyle`] || settings[`${p}.template.headerStyle`] || 'standard',
      logoSize: Number(settings[`${p}.logoSize`]) || 100,
      logoUrl: settings[`${p}.logo`] || '',
      showLogo: (settings[`${p}.showLogo`] ?? settings[`${p}.template.showLogo`]) !== 'false',
      showCompanyName: settings[`${p}.showCompanyName`] !== 'false',
    },
  }
}

/**
 * The template the print builders take, with the layout filled out with
 * defaults. Blank colours become undefined, which is how the builders spell
 * "use the default", rather than empty strings they would try to draw with.
 */
export function templateConfigFromSource(source: DesignSource): TemplateConfig {
  const t = source.template
  return {
    primaryColor: t.primaryColor || '#d97706',
    backgroundColor: t.backgroundColor || undefined,
    textColor: t.textColor || undefined,
    companyTextColor: t.companyTextColor || undefined,
    frameBorderColor: t.frameBorderColor || undefined,
    frameShadow: t.frameShadow,
    frameRadius: Number(t.frameRadius) || 0,
    frameSide: t.frameSide === 'right' ? 'right' : 'left',
    fontFamily: t.fontFamily || 'Helvetica',
    showLogo: t.showLogo !== false,
    showCompanyName: t.showCompanyName !== false,
    headerStyle: t.headerStyle || 'standard',
    logoSize: Number(t.logoSize) || 100,
    layoutConfig: mergeWithDefaults(source.layout),
  }
}

/**
 * The source as it should be frozen: the layout with every default written
 * out, so a default that changes later cannot reach into an issued document.
 */
export function materializeDesignSource(source: DesignSource): DesignSource {
  return { layout: mergeWithDefaults(source.layout), template: { ...source.template } }
}

/**
 * A design row as the designer and the gallery hold it. Null for a row whose
 * JSON cannot be read, which the callers drop rather than crash on.
 */
export function savedDesignFromRow(row: {
  id: string
  name: string
  updatedAt: Date
  layout: unknown
  template: unknown
  autoRule?: string | null
}): SavedDesign | null {
  const source = designSourceFromStored(row.layout, row.template)
  if (!source) return null
  return {
    id: row.id,
    name: row.name,
    savedAt: row.updatedAt.toISOString(),
    layout: mergeWithDefaults(source.layout),
    template: source.template,
    autoRule: isDesignAutoRule(row.autoRule) ? row.autoRule : null,
  }
}
