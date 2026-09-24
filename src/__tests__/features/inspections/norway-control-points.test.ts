import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { EN_LIBRARY } from '@/features/inspections/Lib/inspectionLibrary'
import {
  NO_DEFECTS_BY_CODE,
  NO_SECTIONS,
  NO_STANDARD,
} from '@/features/inspections/Lib/norwayControlPoints'
import { getPreset, resolvePreset } from '@/features/inspections/Lib/templatePresets'
import { rankSuggestions } from '@/features/inspections/Lib/defectCatalogue'

const nb = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'messages/nb/inspectionLibrary.json'), 'utf-8')
)

const byCode = (code: string) =>
  NO_SECTIONS.flatMap((s) => s.items).find((i) => i.code === code && !i.inputType)

describe('Norway EU-kontroll preset', () => {
  const preset = getPreset('no-eu-kontroll')!

  it("follows Statens vegvesen's instruks, not the Directive's Annex", () => {
    expect(preset.standard).toBe(NO_STANDARD)
    expect(preset.sections).toBe(NO_SECTIONS)
    // The other statutory presets keep the Annex list.
    expect(getPreset('de-hauptuntersuchung')!.sections).not.toBe(NO_SECTIONS)
  })

  it('uses the instruks numbering where it differs from the Annex', () => {
    expect(resolvePreset(preset, nb).sections.flatMap((s) => s.items)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: '7.5', name: 'Refleksvest' }),
        expect.objectContaining({ code: '8.3.1', name: 'Væskelekkasjer' }),
        expect.objectContaining({ code: '2.1.5', name: 'Servostyring' }),
      ])
    )
    expect(byCode('8.5')).toBeUndefined()
  })

  it('covers the points the Annex list was missing', () => {
    for (const code of ['4.14.1', '4.14.2', '7.14.1', '8.2.3.1', '6.1.9', '7.1.5', '10.1'])
      expect(byCode(code), code).toBeDefined()
  })

  it('measures against the Norwegian limits', () => {
    const rows = NO_SECTIONS.flatMap((s) => s.items).filter((i) => i.inputType === 'measurement')
    const row = (key: string) => rows.find((r) => r.key === key)!
    expect(row('no_m_efficiency_m1_2012').minValue).toBe(58)
    expect(row('no_m_tread_winter').minValue).toBe(3)
    expect(row('no_m_co_idle_euro3').maxValue).toBe(0.3)
    expect(row('no_m_co_high_idle_euro3').maxValue).toBe(0.2)
    expect(row('no_m_opacity_euro6').maxValue).toBe(0.7)
  })

  it('has Norwegian and English text for every key it uses', () => {
    for (const section of NO_SECTIONS) {
      expect(nb.sections[section.key], section.key).toBeTruthy()
      for (const item of section.items) {
        expect(nb.checks[item.key], item.key).toBeTruthy()
        expect(EN_LIBRARY.checks, item.key).toHaveProperty(item.key)
        if (item.descriptionKey) expect(nb.descriptions[item.descriptionKey]).toBeTruthy()
      }
    }
    for (const entries of Object.values(NO_DEFECTS_BY_CODE)) {
      for (const [key] of entries) {
        expect(nb.defects[key], key).toBeTruthy()
        expect(EN_LIBRARY.defects, key).toHaveProperty(key)
      }
    }
  })
})

describe('Norwegian defect reasons', () => {
  it('offers the instruks reasons with their grades for a Norwegian check', () => {
    const suggestions = rankSuggestions(
      { name: 'Bremsebånd og bremseklosser', code: '1.1.13', standard: NO_STANDARD },
      { lib: nb }
    )
    const regulation = suggestions.filter((s) => s.source === 'regulation')
    expect(regulation).toEqual(
      expect.arrayContaining([
        { text: 'a) For stor slitasje på bremsebelegg', severity: 'fail', source: 'regulation' },
        expect.objectContaining({ severity: 'dangerous', source: 'regulation' }),
      ])
    )
    expect(regulation.find((s) => s.text.startsWith('c)'))?.severity).toBe('dangerous')
  })

  it('never mixes in the Annex wording for a code the two number differently', () => {
    // 7.5 is the hi-vis vest in Norway and the first aid kit in the Annex.
    const suggestions = rankSuggestions({ name: 'Refleksvest', code: '7.5', standard: NO_STANDARD })
    const regulation = suggestions.filter((s) => s.source === 'regulation')
    expect(regulation.length).toBeGreaterThan(0)
    expect(regulation.every((s) => /^[a-z]\) /.test(s.text))).toBe(true)
    expect(regulation.every((s) => s.severity === 'attention')).toBe(true)
  })

  it('keeps the Annex catalogue for templates that follow the Directive', () => {
    const suggestions = rankSuggestions({ name: 'Brake linings', code: '1.1.13' })
    expect(suggestions.some((s) => /^[a-z]\) /.test(s.text))).toBe(false)
  })
})
