/**
 * A design is one shape wherever it came from: a saved row, the workshop's
 * settings, or a snapshot. The hash over that shape is what lets a thousand
 * invoices issued with the same look share one stored copy.
 */
import { describe, expect, it } from 'vitest'
import { canonicalJson, contentHash } from '@/features/invoice-designer/Lib/designHash'
import {
  designSourceFromSettings,
  designSourceFromStored,
  materializeDesignSource,
  savedDesignFromRow,
  templateConfigFromSource,
} from '@/features/invoice-designer/Lib/designSource'

describe('canonicalJson', () => {
  it('orders keys at every depth and drops undefined', () => {
    const a = canonicalJson({ b: 1, a: { d: undefined, c: [{ z: 1, y: 2 }] } })
    const b = canonicalJson({ a: { c: [{ y: 2, z: 1 }] }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":[{"y":2,"z":1}]},"b":1}')
  })

  it('hashes the same design the same however its keys were written', () => {
    const one = contentHash({ template: { primaryColor: '#000', fontFamily: 'Lato' } })
    const two = contentHash({ template: { fontFamily: 'Lato', primaryColor: '#000' } })
    expect(one).toBe(two)
    expect(one).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('designSourceFromSettings', () => {
  it('reads the keys every renderer read, with the legacy fallbacks', () => {
    const source = designSourceFromSettings(
      {
        'invoice.template.primaryColor': '#123456',
        'invoice.frameSide': 'right',
        'invoice.logo': '/uploads/x.png',
        'invoice.showLogo': 'false',
        'invoice.layoutConfig': '{"version":3,"sections":[]}',
      },
      'invoice'
    )
    expect(source.template.primaryColor).toBe('#123456')
    expect(source.template.frameSide).toBe('right')
    expect(source.template.logoUrl).toBe('/uploads/x.png')
    expect(source.template.showLogo).toBe(false)
    expect(source.template.showCompanyName).toBe(true)
    expect(source.layout.version).toBe(3)
  })

  it('shrugs off a layout that is not JSON', () => {
    const source = designSourceFromSettings({ 'invoice.layoutConfig': '{oops' }, 'invoice')
    expect(source.layout).toEqual({})
  })
})

describe('designSourceFromStored', () => {
  it('fills a sparse template with the defaults the designer would', () => {
    const source = designSourceFromStored({}, { primaryColor: '#abc', extra: 'kept' })
    expect(source?.template.primaryColor).toBe('#abc')
    expect(source?.template.fontFamily).toBe('Helvetica')
    expect((source?.template as unknown as Record<string, unknown>).extra).toBe('kept')
  })

  it('refuses a template that is not an object', () => {
    expect(designSourceFromStored({}, 'nope')).toBeNull()
  })
})

describe('templateConfigFromSource', () => {
  it('turns blank colours into undefined and merges the layout', () => {
    const source = designSourceFromStored({}, { backgroundColor: '', textColor: '#111' })
    const config = templateConfigFromSource(source!)
    expect(config.backgroundColor).toBeUndefined()
    expect(config.textColor).toBe('#111')
    expect(config.layoutConfig?.sections.length).toBeGreaterThan(0)
  })
})

describe('materializeDesignSource', () => {
  it('writes every default out so a later default cannot reach in', () => {
    const frozen = materializeDesignSource({
      layout: { sections: [] },
      template: designSourceFromStored({}, {})!.template,
    })
    expect(frozen.layout.sections?.length).toBeGreaterThan(0)
    // Materializing again changes nothing, so the hash is stable.
    expect(contentHash(materializeDesignSource(frozen))).toBe(contentHash(frozen))
  })
})

describe('savedDesignFromRow', () => {
  it('maps a row to what the gallery shows', () => {
    const saved = savedDesignFromRow({
      id: 'd1',
      name: 'Tax Invoice',
      updatedAt: new Date('2026-09-03T00:00:00Z'),
      layout: { sections: [] },
      template: { primaryColor: '#000' },
    })
    expect(saved?.id).toBe('d1')
    expect(saved?.savedAt).toBe('2026-09-03T00:00:00.000Z')
    expect(saved?.template.primaryColor).toBe('#000')
    expect(saved?.layout.sections.length).toBeGreaterThan(0)
  })
})
