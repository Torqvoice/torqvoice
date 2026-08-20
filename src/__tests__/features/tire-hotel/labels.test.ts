import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  LABEL_FORMATS,
  LABEL_SPECS,
  defaultCopies,
  labelLayout,
  pageCount,
  perPage,
} from '@/features/tire-hotel/Lib/labels'

describe('label formats', () => {
  it('covers every declared format', () => {
    for (const format of LABEL_FORMATS) {
      expect(LABEL_SPECS[format], `${format} has no spec`).toBeDefined()
    }
  })

  it('converts millimetres to points', () => {
    // 25.4mm is one inch, which is 72 points.
    const spec = LABEL_SPECS.dymo_standard
    expect(spec.width / spec.widthMm).toBeCloseTo(72 / 25.4, 6)
  })

  it('keeps a sheet grid inside A4', () => {
    const sheet = LABEL_SPECS.sheet_a4
    const MM = 72 / 25.4
    expect(sheet.widthMm * sheet.columns).toBeLessThanOrEqual(210)
    expect(sheet.heightMm * sheet.rows).toBeLessThanOrEqual(297)
    expect(sheet.width * sheet.columns).toBeLessThanOrEqual(210 * MM)
  })

  it('gives roll formats exactly one label per page', () => {
    // A roll printer advances a page per sticker, so anything else would
    // print blanks between labels.
    for (const format of ['dymo_small', 'dymo_standard', 'thermal_large'] as const) {
      expect(perPage(format), `${format} should be one per page`).toBe(1)
    }
  })
})

describe('how many labels', () => {
  it('prints one per tire', () => {
    // Per tire, not per set: a set split across shelves, or one tire away for
    // repair, is exactly what a single set-level label fails at.
    expect(defaultCopies(4)).toBe(4)
    expect(defaultCopies(2)).toBe(2)
    expect(defaultCopies(5)).toBe(5)
  })

  it('never asks for zero', () => {
    expect(defaultCopies(0)).toBe(1)
    expect(defaultCopies(-3)).toBe(1)
  })

  it('caps a runaway count', () => {
    expect(defaultCopies(9999)).toBe(20)
  })
})

describe('paging', () => {
  it('gives a page per label on a roll', () => {
    expect(pageCount('dymo_standard', 4)).toBe(4)
  })

  it('fills a sheet before starting another', () => {
    const per = perPage('sheet_a4')
    expect(pageCount('sheet_a4', per)).toBe(1)
    expect(pageCount('sheet_a4', per + 1)).toBe(2)
  })

  it('never returns a fractional page', () => {
    for (const format of LABEL_FORMATS) {
      for (const copies of [1, 3, 7, 13, 40]) {
        expect(Number.isInteger(pageCount(format, copies))).toBe(true)
      }
    }
  })
})

describe('label layout', () => {
  it('is defined for every detail level a spec uses', () => {
    for (const format of LABEL_FORMATS) {
      const layout = labelLayout(LABEL_SPECS[format].detail)
      expect(layout.qr, `${format} has no QR size`).toBeGreaterThan(0)
      expect(layout.plate, `${format} has no plate size`).toBeGreaterThan(0)
    }
  })

  it('keeps the plate the largest text on every label', () => {
    // The plate is what identifies a tire to someone holding it, so nothing
    // is allowed to outgrow it.
    for (const detail of ['minimal', 'standard', 'full'] as const) {
      const layout = labelLayout(detail)
      for (const [name, size] of Object.entries({
        body: layout.body,
        footer: layout.footer,
        flag: layout.flag,
        reference: layout.reference,
      })) {
        expect(size, `${detail}: ${name} is not smaller than the plate`).toBeLessThan(layout.plate)
      }
    }
  })

  it('drops the supporting detail only on the smallest label', () => {
    expect(labelLayout('minimal').showDetail).toBe(false)
    expect(labelLayout('standard').showDetail).toBe(true)
    expect(labelLayout('full').showDetail).toBe(true)
  })

  it('grows the plate as the label grows', () => {
    expect(labelLayout('minimal').plate).toBeLessThan(labelLayout('standard').plate)
    expect(labelLayout('standard').plate).toBeLessThan(labelLayout('full').plate)
  })

  it('only stacks on the tall roll', () => {
    // The others are wider than they are tall, so a stacked layout would
    // waste the width the plate needs.
    expect(labelLayout('full').stacked).toBe(true)
    expect(labelLayout('standard').stacked).toBe(false)
    expect(labelLayout('minimal').stacked).toBe(false)
  })

  it('keeps the QR inside the label it prints on', () => {
    const PT_PER_MM = 72 / 25.4
    for (const format of LABEL_FORMATS) {
      const spec = LABEL_SPECS[format]
      const layout = labelLayout(spec.detail)
      const shortestSide = Math.min(spec.widthMm, spec.heightMm) * PT_PER_MM
      expect(layout.qr + layout.padding * 2, `${format}: the QR does not fit`).toBeLessThanOrEqual(
        shortestSide
      )
    }
  })

  it('prints the fallback URL only where there is room for it', () => {
    // Unreadable at the sizes the smaller labels would give it.
    expect(labelLayout('full').showUrl).toBe(true)
    expect(labelLayout('standard').showUrl).toBe(false)
    expect(labelLayout('minimal').showUrl).toBe(false)
  })
})

describe('preview and print agree', () => {
  it('both read the shared layout rather than their own numbers', () => {
    const root = process.cwd()

    // The preview exists to show what will print. Two hand-maintained copies
    // of the same sizes would drift, and the drift would only show up on a
    // wasted roll of labels.
    for (const file of [
      'src/features/tire-hotel/Components/TireLabelPDF.tsx',
      'src/features/tire-hotel/Components/LabelPreview.tsx',
    ]) {
      const source = fs.readFileSync(path.join(root, file), 'utf-8')
      expect(source, `${file} does not use labelLayout`).toContain('labelLayout')
      expect(source, `${file} still branches on spec.detail directly`).not.toMatch(
        /detail === '(minimal|full)'/
      )
    }
  })
})
