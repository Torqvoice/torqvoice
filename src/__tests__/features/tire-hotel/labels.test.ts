import { describe, it, expect } from 'vitest'
import {
  LABEL_FORMATS,
  LABEL_SPECS,
  defaultCopies,
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
