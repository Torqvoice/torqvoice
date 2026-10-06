/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as OLD from './head/invoiceLayoutSchema'
import * as OLDP from './head/layoutPresets'
import { contentHash } from '@/features/invoice-designer/Lib/designHash'
import { materializeDesignSource, designSourceFromStored, designSourceFromSettings } from '@/features/invoice-designer/Lib/designSource'

const OUT = process.env.OUT_FILE as string
describe('hash', () => {
  it('issued snapshot hash vs today', () => {
    const lines: string[] = []
    const template = designSourceFromSettings({}, 'invoice').template
    // 1. workshop with no saved layout at all
    const headDefault = contentHash({ layout: OLD.mergeWithDefaults({}), template: { ...template } })
    const nowDefault = contentHash(materializeDesignSource({ layout: {}, template }))
    lines.push(`no saved layout: frozen-at-HEAD hash === today's hash ? ${headDefault === nowDefault}`)
    // 2. a design row saved at HEAD from the designer (fully merged, sheet order)
    const stored = { ...(OLD.mergeWithDefaults({ ...(OLDP.buildLayoutFromPreset(OLDP.layoutPresets[0] as any) as any), version: 3 }) as any) }
    const src = designSourceFromStored(JSON.parse(JSON.stringify(stored)), template)!
    const headRow = contentHash({ layout: OLD.mergeWithDefaults(src.layout as any), template: { ...src.template } })
    const nowRow = contentHash(materializeDesignSource(src))
    lines.push(`saved design row: frozen-at-HEAD hash === today's hash ? ${headRow === nowRow}`)
    writeFileSync(`${OUT}.hash.txt`, lines.join('\n'))
    expect(true).toBe(true)
  })
})
