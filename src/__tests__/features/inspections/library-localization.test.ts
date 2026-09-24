import { describe, it, expect } from 'vitest'
import { EN_LIBRARY, type InspectionLibrary } from '@/features/inspections/Lib/inspectionLibrary'
import {
  TEMPLATE_PRESETS,
  getPreset,
  presetToTemplateCreate,
  resolvePreset,
} from '@/features/inspections/Lib/templatePresets'
import {
  buildLibraryIndex,
  planRelocalization,
  type StoredTemplate,
} from '@/features/inspections/Lib/presetLocalization'
import { rankSuggestions } from '@/features/inspections/Lib/defectCatalogue'

/** A stand-in translation: every English value prefixed, so the tests do not depend on wording. */
function fakeLibrary(prefix: string, keywords: Partial<InspectionLibrary['defectKeywords']> = {}) {
  const tag = (table: Record<string, string>) =>
    Object.fromEntries(Object.entries(table).map(([k, v]) => [k, `${prefix} ${v}`]))
  return {
    presets: Object.fromEntries(
      Object.entries(EN_LIBRARY.presets).map(([id, p]) => [
        id,
        {
          name: `${prefix} ${p.name}`,
          description: `${prefix} ${p.description}`,
          standardLabel: `${prefix} ${p.standardLabel}`,
        },
      ])
    ),
    sections: tag(EN_LIBRARY.sections),
    checks: tag(EN_LIBRARY.checks),
    descriptions: tag(EN_LIBRARY.descriptions),
    choices: tag(EN_LIBRARY.choices),
    defects: tag(EN_LIBRARY.defects),
    defectKeywords: { ...EN_LIBRARY.defectKeywords, ...keywords },
  } as InspectionLibrary
}

const NB = fakeLibrary('NB')
const DE = fakeLibrary('DE')

/** A preset as it sits in the database after an install in `lib`'s language. */
function installed(presetId: string, lib: InspectionLibrary): StoredTemplate {
  const preset = getPreset(presetId)
  if (!preset) throw new Error(presetId)
  const data = presetToTemplateCreate(preset, 'org', false, lib)
  return {
    id: 't1',
    name: data.name,
    description: data.description,
    packageId: data.packageId,
    sections: data.sections.create.map((section, s) => ({
      id: `s${s}`,
      name: section.name,
      description: section.description,
      items: section.items.create.map((item, i) => ({
        id: `s${s}i${i}`,
        name: item.name,
        description: item.description,
        choices: item.choices,
      })),
    })),
  }
}

describe('installing a preset in the workshop language', () => {
  it('writes every section, check, description and choice in that language', () => {
    const data = presetToTemplateCreate(getPreset('pre-purchase')!, 'org', false, NB)
    expect(data.name.startsWith('NB ')).toBe(true)
    for (const section of data.sections.create) {
      expect(section.name.startsWith('NB ')).toBe(true)
      for (const item of section.items.create) {
        expect(item.name.startsWith('NB ')).toBe(true)
        for (const choice of item.choices) expect(choice.startsWith('NB ')).toBe(true)
      }
    }
  })

  it('falls back to English for a key the language has not translated', () => {
    const partial = { ...NB, checks: {} } as InspectionLibrary
    const preset = resolvePreset(getPreset('standard-multipoint')!, partial)
    expect(preset.sections[0].name.startsWith('NB ')).toBe(true)
    expect(preset.sections[0].items[0].name).toBe(EN_LIBRARY.checks.bodyCondition)
  })

  it('has English text for every key a preset uses', () => {
    for (const preset of TEMPLATE_PRESETS) {
      for (const section of preset.sections) {
        expect(EN_LIBRARY.sections, section.key).toHaveProperty(section.key)
        if (section.descriptionKey)
          expect(EN_LIBRARY.descriptions).toHaveProperty(section.descriptionKey)
        for (const item of section.items) {
          expect(EN_LIBRARY.checks, item.key).toHaveProperty(item.key)
          if (item.descriptionKey)
            expect(EN_LIBRARY.descriptions).toHaveProperty(item.descriptionKey)
          for (const choice of item.choices ?? []) expect(EN_LIBRARY.choices).toHaveProperty(choice)
        }
      }
      expect(EN_LIBRARY.presets).toHaveProperty(preset.id)
    }
  })
})

describe('converting an installed checklist', () => {
  const index = buildLibraryIndex([EN_LIBRARY, NB, DE])

  it('rewrites an untouched English checklist into the workshop language', () => {
    const template = installed('eu-roadworthiness', EN_LIBRARY)
    const plan = planRelocalization(template, NB, index)
    expect(plan.template?.name).toBe(NB.presets['eu-roadworthiness'].name)
    const itemCount = template.sections.reduce((n, s) => n + s.items.length, 0)
    expect(plan.sections).toHaveLength(template.sections.length)
    expect(plan.items).toHaveLength(itemCount)
    expect(plan.items.every((i) => i.data.name?.startsWith('NB '))).toBe(true)
  })

  it('leaves text the workshop wrote itself alone', () => {
    const template = installed('standard-multipoint', EN_LIBRARY)
    template.name = 'Our health check'
    template.sections[0].name = 'Outside'
    template.sections[0].items[0].name = 'Dents and scratches'

    const plan = planRelocalization(template, NB, index)
    expect(plan.template?.name).toBeUndefined()
    expect(plan.sections.find((s) => s.id === 's0')?.data.name).toBeUndefined()
    expect(plan.items.find((i) => i.id === 's0i0')).toBeUndefined()
    // The rest of the checklist still moves.
    expect(plan.items.find((i) => i.id === 's0i1')?.data.name).toBe(NB.checks.paint)
  })

  it('follows the workshop from one translation to another', () => {
    const plan = planRelocalization(installed('marine', NB), DE, index)
    expect(plan.template?.name).toBe(DE.presets.marine.name)
    expect(plan.items.every((i) => i.data.name?.startsWith('DE '))).toBe(true)
  })

  it('plans nothing when the checklist is already in the language', () => {
    const plan = planRelocalization(installed('pre-purchase', NB), NB, index)
    expect(plan).toEqual({ template: null, sections: [], items: [] })
  })

  it('translates choices only as a complete set', () => {
    const template = installed('pre-purchase', EN_LIBRARY)
    const history = template.sections[0].items.find((i) => i.choices.length > 0)!
    const untouched = planRelocalization(template, NB, index)
    expect(untouched.items.find((i) => i.id === history.id)?.data.choices).toEqual(
      history.choices.map((c) => `NB ${c}`)
    )

    history.choices = [...history.choices, 'Stamped book only']
    const edited = planRelocalization(template, NB, index)
    expect(edited.items.find((i) => i.id === history.id)?.data.choices).toBeUndefined()
  })
})

describe('defect suggestions in the technician language', () => {
  it('offers the regulation phrases in that language', () => {
    const suggestions = rankSuggestions({ name: 'Bremseklosser', code: '1.1.13' }, { lib: NB })
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every((s) => s.text.startsWith('NB '))).toBe(true)
  })

  it('matches a check named in the workshop language by its word stems', () => {
    const withStems = fakeLibrary('NB', { brakes: 'brems, kloss' })
    const matched = rankSuggestions({ name: 'Bremseklosser foran' }, { lib: withStems })
    const unmatched = rankSuggestions({ name: 'Bremseklosser foran' }, { lib: NB })
    expect(matched.length).toBeGreaterThan(unmatched.length)
  })
})
