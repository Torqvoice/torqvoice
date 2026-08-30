/**
 * The layout editor's starting arrangements. They choose nothing but where
 * things sit, which is what separates them from the template presets on the
 * Templates page.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { layoutPresets, buildLayoutFromPreset } from '@/features/settings/Schema/layoutPresets'
import {
  BUILTIN_FOOTER_FIELDS,
  BUILTIN_SECTIONS,
  invoiceLayoutConfigSchema,
} from '@/features/settings/Schema/invoiceLayoutSchema'

const LOCALES = readdirSync('messages')

describe('layout presets', () => {
  it('offers four arrangements', () => {
    expect(layoutPresets.map((p) => p.id)).toEqual(['classic', 'letterhead', 'compact', 'detailed'])
  })

  it.each(layoutPresets)('$id only names sections that exist', (preset) => {
    const known = new Set<string>(BUILTIN_SECTIONS.map((s) => s.id))
    const unknown = [
      ...preset.order,
      ...Object.keys(preset.columns ?? {}),
      ...(preset.plain ?? []),
    ].filter((id) => !known.has(id))
    expect(unknown).toEqual([])
  })

  it.each(layoutPresets)('$id builds a valid layout', (preset) => {
    const config = buildLayoutFromPreset(preset)
    expect(() => invoiceLayoutConfigSchema.parse(config)).not.toThrow()

    // Every section survives, so trying a preset on and picking another never
    // throws away a section the workshop had configured.
    expect(config.sections.map((s) => s.id).sort()).toEqual(
      BUILTIN_SECTIONS.map((s) => s.id).sort()
    )
  })

  it.each(layoutPresets)('$id prints its sections in the order it asked for', (preset) => {
    const visible = buildLayoutFromPreset(preset)
      .sections.filter((s) => s.visible)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id)
    expect(visible).toEqual(preset.order)
  })

  it.each(layoutPresets)('$id leaves other sections their own fields', (preset) => {
    const config = buildLayoutFromPreset(preset)
    // A preset names fields for the header and the footer only. Everything else
    // keeps what it had, or the detail blocks come out empty.
    for (const id of ['customer', 'vehicle', 'service', 'bank_account']) {
      const fields = config.sections.find((s) => s.id === id)?.fields
      expect(fields?.length, id).toBeGreaterThan(0)
      expect(
        fields?.every((f) => f.visible),
        id
      ).toBe(true)
    }
  })

  it('shows the whole footer on the detailed arrangement', () => {
    const detailed = layoutPresets.find((p) => p.id === 'detailed')
    const footer = buildLayoutFromPreset(detailed!).sections.find((s) => s.id === 'footer')
    // Every footer field, derived rather than listed, so one added later is
    // carried here instead of quietly missing.
    expect(footer?.fields?.filter((f) => f.visible).map((f) => f.id)).toEqual(
      BUILTIN_FOOTER_FIELDS.map((f) => f.id)
    )
  })

  it('gives every template its own look, not only its own arrangement', () => {
    // Four templates that changed nothing but which sections were on looked
    // identical, because the band, the rail and the color were saved elsewhere
    // and never touched by picking one.
    const looks = layoutPresets.map((p) => JSON.stringify(p.template))
    expect(new Set(looks).size).toBe(layoutPresets.length)

    const headers = layoutPresets.map((p) => p.template.headerStyle)
    expect(new Set(headers).size).toBeGreaterThan(1)
    const colors = layoutPresets.map((p) => p.template.primaryColor)
    expect(new Set(colors).size).toBe(layoutPresets.length)
  })

  it('gives every arrangement a different one', () => {
    const shapes = layoutPresets.map((p) => JSON.stringify(buildLayoutFromPreset(p)))
    expect(new Set(shapes).size).toBe(layoutPresets.length)
  })

  it.each(LOCALES)('names every arrangement in %s', (locale) => {
    const json = JSON.parse(readFileSync(`messages/${locale}/settings.json`, 'utf8'))
    const named = json.layoutEditor?.presets ?? {}
    for (const preset of layoutPresets) {
      expect(named[preset.id]?.name, `${locale}/${preset.id}`).toBeTruthy()
      expect(named[preset.id]?.description, `${locale}/${preset.id}`).toBeTruthy()
    }
  })
})
