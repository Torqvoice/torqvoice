/**
 * A clean inspection says so on its certificate.
 *
 * "No deficiencies were recorded." printed on every clean certificate before
 * it had a switch. A starting point that lists the defects section's fields
 * switches off the ones it leaves out, so each has to name the note or the
 * default certificate stops printing it.
 */
import { describe, expect, it } from 'vitest'
import {
  buildLayoutFromPreset,
  certificatePresets,
  layoutPresets,
  workOrderPresets,
} from '@/features/settings/Schema/layoutPresets'

describe('the no-defects note on the starting points', () => {
  const withDefects = [...layoutPresets, ...certificatePresets, ...workOrderPresets]
    .map((preset) => ({ preset, layout: buildLayoutFromPreset(preset) }))
    .filter(({ layout }) => layout.sections.some((s) => s.id === 'defects' && s.fields))

  it('covers the certificate starting points', () => {
    expect(withDefects.some(({ preset }) => preset.documentType === 'certificate')).toBe(true)
  })

  it.each(
    withDefects.map(({ preset, layout }) => [preset.id, layout] as const)
  )('%s keeps the note on', (_id, layout) => {
    const fields = layout.sections.find((s) => s.id === 'defects')?.fields ?? []
    expect(fields.find((f) => f.id === 'no_defects_note')?.visible).toBe(true)
  })
})
