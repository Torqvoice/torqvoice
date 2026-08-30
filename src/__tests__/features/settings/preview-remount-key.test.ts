/**
 * The layout preview remounts its viewer on a key. That key used to list four
 * properties of each section, so every option added since — colors, the frame
 * edge, whether a section is boxed, which header fields print — changed the
 * document without changing the key, and looked from the outside like it did
 * nothing at all.
 *
 * The key is the whole document now. This holds it there.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const SOURCE = readFileSync(
  'src/features/settings/Components/InvoiceLayoutPreviewRenderer.tsx',
  'utf8'
)

describe('layout preview remount key', () => {
  it('is built from the whole document, not a list of properties', () => {
    const key = SOURCE.slice(SOURCE.indexOf('const documentKey'), SOURCE.indexOf('useSettled('))
    for (const part of ['config', 'templateConfig', 'logoUrl', 'previewWorkshop']) {
      expect(key, part).toContain(part)
    }
    // A hand-picked subset is what broke it. Anything that reads properties off
    // sections to build the key has gone back to the old shape.
    expect(key).not.toMatch(/s\.(id|order|visible|column)/)
  })

  it('waits for the value to settle before remounting', () => {
    // A color picker fires on every step of a drag, and each distinct key is a
    // full re-render of the document.
    expect(SOURCE).toContain('useSettled(documentKey')
  })

  it('passes the settled key to the viewer', () => {
    expect(SOURCE).toContain('key={configKey}')
  })
})
