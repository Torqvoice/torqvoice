import { EN_LIBRARY, type InspectionLibrary, libraryText } from './inspectionLibrary'
import { PRESET_NAMESPACE } from './templatePresets'

/**
 * Moving an installed built-in checklist into another language.
 *
 * A template is copied out of the library at install time, so its text is
 * ordinary data by the time the workshop's language is known or changes. This
 * recognises text that is still exactly what the library wrote, in any locale,
 * and plans a rewrite of just that text. Anything the workshop typed itself
 * matches nothing and is left alone, so a renamed check keeps its new name.
 */

type Table = 'sections' | 'checks' | 'descriptions' | 'choices'
const TABLES: Table[] = ['sections', 'checks', 'descriptions', 'choices']

export interface LibraryIndex {
  /** Built-in text in any locale → its key, per table. */
  keys: Record<Table, Map<string, string>>
  /** Built-in preset names and descriptions in any locale → the preset id. */
  presetNames: Map<string, string>
  presetDescriptions: Map<string, string>
}

const norm = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export function buildLibraryIndex(libraries: InspectionLibrary[]): LibraryIndex {
  const keys = Object.fromEntries(TABLES.map((t) => [t, new Map<string, string>()])) as Record<
    Table,
    Map<string, string>
  >
  const presetNames = new Map<string, string>()
  const presetDescriptions = new Map<string, string>()
  // English first, so it wins should a translation ever collide with it.
  for (const lib of [EN_LIBRARY, ...libraries]) {
    for (const table of TABLES) {
      for (const [key, text] of Object.entries(lib[table] as Record<string, string>)) {
        const k = norm(text)
        if (k && !keys[table].has(k)) keys[table].set(k, key)
      }
    }
    for (const [id, preset] of Object.entries(lib.presets)) {
      if (!presetNames.has(norm(preset.name))) presetNames.set(norm(preset.name), id)
      if (!presetDescriptions.has(norm(preset.description)))
        presetDescriptions.set(norm(preset.description), id)
    }
  }
  return { keys, presetNames, presetDescriptions }
}

export interface StoredTemplate {
  id: string
  name: string
  description: string | null
  packageId: string | null
  sections: {
    id: string
    name: string
    description: string | null
    items: { id: string; name: string; description: string | null; choices: string[] }[]
  }[]
}

type Change<T> = { id: string; data: T }

export interface RelocalizationPlan {
  template: { name?: string; description?: string } | null
  sections: Change<{ name?: string; description?: string }>[]
  items: Change<{ name?: string; description?: string; choices?: string[] }>[]
}

/** Whether a template came from the built-in library rather than a workshop or a package. */
export function isBuiltinTemplate(template: Pick<StoredTemplate, 'packageId'>): boolean {
  return !!template.packageId?.startsWith(`${PRESET_NAMESPACE}/`)
}

/** Only fields whose text is built-in and differs from the target language are touched. */
export function planRelocalization(
  template: StoredTemplate,
  target: InspectionLibrary,
  index: LibraryIndex
): RelocalizationPlan {
  const translate = (table: Table, text: string | null): string | undefined => {
    if (!text) return undefined
    const key = index.keys[table].get(norm(text))
    if (!key) return undefined
    const next = libraryText(target, table, key)
    return next !== text ? next : undefined
  }

  const presetId = template.packageId?.slice(PRESET_NAMESPACE.length + 1) ?? ''
  const targetPreset = (target.presets as Record<string, { name: string; description: string }>)[
    presetId
  ]
  const templateChange: { name?: string; description?: string } = {}
  if (targetPreset) {
    if (
      index.presetNames.get(norm(template.name)) === presetId &&
      template.name !== targetPreset.name
    )
      templateChange.name = targetPreset.name
    if (
      template.description &&
      index.presetDescriptions.get(norm(template.description)) === presetId &&
      template.description !== targetPreset.description
    )
      templateChange.description = targetPreset.description
  }

  const sections: RelocalizationPlan['sections'] = []
  const items: RelocalizationPlan['items'] = []
  for (const section of template.sections) {
    const data = {
      name: translate('sections', section.name),
      description: translate('descriptions', section.description),
    }
    if (data.name || data.description) sections.push({ id: section.id, data: compact(data) })

    for (const item of section.items) {
      const translatedChoices = item.choices.map((c) => translate('choices', c))
      // Choices are only rewritten as a set: a half-translated list would read worse than either.
      const choicesAreBuiltin =
        item.choices.length > 0 &&
        item.choices.every((c) => index.keys.choices.has(norm(c))) &&
        translatedChoices.some(Boolean)
      const itemData = {
        name: translate('checks', item.name),
        description: translate('descriptions', item.description),
        choices: choicesAreBuiltin
          ? item.choices.map((c, i) => translatedChoices[i] ?? c)
          : undefined,
      }
      if (itemData.name || itemData.description || itemData.choices)
        items.push({ id: item.id, data: compact(itemData) })
    }
  }

  return {
    template: Object.keys(templateChange).length > 0 ? templateChange : null,
    sections,
    items,
  }
}

function compact<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T
}
