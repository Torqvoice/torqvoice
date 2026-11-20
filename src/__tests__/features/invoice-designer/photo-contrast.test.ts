/**
 * How far the faded vehicle photo is washed out. Whatever the picture, the
 * Vehicle block's inks keep WCAG AA contrast on every pixel of it: dark inks
 * get a floor every channel is raised to, light inks a ceiling.
 */
import { describe, expect, it } from 'vitest'
import {
  AA_CONTRAST,
  ceilingForLuminance,
  channelLuminance,
  contrastRatio,
  floorForLuminance,
  linearFor,
  parseColor,
  photoToneFor,
  relativeLuminance,
  withinTone,
} from '@/features/invoice-designer/Lib/photoContrast'
import { vehicleBlockTone } from '@/features/invoice-designer/Lib/vehiclePhoto'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'

const lum = (color: string) => relativeLuminance(parseColor(color)!)
/** The worst pixel the tone allows: grey at its limit. */
const worst = (value: number) => channelLuminance(value)

describe('reading colours', () => {
  it('reads the forms the designer stores', () => {
    expect(parseColor('#111827')).toEqual([17, 24, 39])
    expect(parseColor('111827')).toEqual([17, 24, 39])
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('rgb(120, 125, 133)')).toEqual([120, 125, 133])
    expect(parseColor('nonsense')).toBeNull()
    expect(parseColor('rgb(300, 0, 0)')).toBeNull()
  })

  it('measures luminance and contrast the WCAG way', () => {
    expect(lum('#ffffff')).toBeCloseTo(1)
    expect(lum('#000000')).toBe(0)
    expect(contrastRatio(1, 0)).toBeCloseTo(21)
    // The usual reference: #767676 on white is just AA.
    expect(contrastRatio(lum('#767676'), 1)).toBeGreaterThanOrEqual(AA_CONTRAST)
  })

  it('finds the grey at a luminance, from either side', () => {
    const floor = floorForLuminance(0.5)
    expect(channelLuminance(floor)).toBeGreaterThanOrEqual(0.5)
    expect(channelLuminance(floor - 1)).toBeLessThan(0.5)
    const ceiling = ceilingForLuminance(0.2)
    expect(channelLuminance(ceiling)).toBeLessThanOrEqual(0.2)
    expect(channelLuminance(ceiling + 1)).toBeGreaterThan(0.2)
  })
})

describe('the tone for dark inks on a light block', () => {
  it.each([
    ['near black on the panel grey', ['#111827'], '#f3f4f6'],
    ['the default inks on the panel grey', ['#111827', '#6b7280'], '#f3f4f6'],
    ['the default inks on white', ['#111827', '#6b7280'], '#ffffff'],
    ['a navy body and a slate label', ['#1e3a8a', '#475569'], '#ffffff'],
    ['a dark green text colour', ['#14532d', 'rgb(120, 140, 125)'], '#fafaf9'],
  ])('keeps AA for %s', (_name, inks, background) => {
    const tone = photoToneFor(inks, background)
    expect(tone.mode).toBe('floor')
    const bg = lum(background)
    for (const ink of inks) {
      // Every ink that read on the plain block still reads on the darkest
      // pixel the photo can have.
      if (contrastRatio(lum(ink), bg) >= AA_CONTRAST) {
        expect(contrastRatio(lum(ink), worst(tone.value))).toBeGreaterThanOrEqual(AA_CONTRAST)
      }
    }
  })

  it('lets the lightest readable ink decide, and leaves one that never read alone', () => {
    // Amber on the panel grey is below AA already; it must not push the
    // photo to blank paper.
    const withAmber = photoToneFor(['#111827', '#6b7280', '#d97706'], '#f3f4f6')
    const without = photoToneFor(['#111827', '#6b7280'], '#f3f4f6')
    expect(withAmber).toEqual(without)
    // Only black asks for less than black and grey together.
    expect(photoToneFor(['#000000'], '#ffffff').value).toBeLessThan(without.value)
  })

  it('keeps the photo light enough to read in black and white', () => {
    // A floor holds every channel, so the grey a printer makes of any pixel
    // is at least the floor too.
    const tone = photoToneFor(['#111827', '#6b7280'], '#ffffff')
    expect(tone.value).toBeGreaterThan(200)
  })
})

describe('the tone for light inks on a dark block', () => {
  it.each([
    ['white on near black', ['#ffffff'], '#111827'],
    ['white and a light grey on navy', ['#ffffff', '#cbd5e1'], '#1e3a8a'],
  ])('holds the photo under a ceiling for %s', (_name, inks, background) => {
    const tone = photoToneFor(inks, background)
    expect(tone.mode).toBe('ceiling')
    for (const ink of inks) {
      expect(contrastRatio(lum(ink), worst(tone.value))).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })
})

describe('the tone as sharp’s linear map', () => {
  it('sends 0..255 onto floor..255', () => {
    const { a, b } = linearFor({ mode: 'floor', value: 240 })
    expect(a * 0 + b).toBe(240)
    expect(a * 255 + b).toBeCloseTo(255)
    expect(withinTone(Math.round(a * 17 + b), { mode: 'floor', value: 240 })).toBe(true)
  })

  it('sends 0..255 onto 0..ceiling', () => {
    const { a, b } = linearFor({ mode: 'ceiling', value: 40 })
    expect(a * 0 + b).toBe(0)
    expect(a * 255 + b).toBeCloseTo(40)
  })
})

describe('a design’s Vehicle block', () => {
  it('fades the photo for the inks the block prints in', () => {
    const layout = getDefaultInvoiceLayout()
    // The default: near-black lines and grey details on the panel grey.
    expect(vehicleBlockTone(layout, {})).toEqual(
      photoToneFor(['#111827', '#6b7280', '#d97706'], '#f3f4f6')
    )
    // A dark sheet with white text gets a ceiling instead.
    const dark = {
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === 'vehicle' ? { ...s, style: { backgroundColor: '#111827' } } : s
      ),
    }
    expect(vehicleBlockTone(dark, { textColor: '#ffffff', backgroundColor: '#111827' }).mode).toBe(
      'ceiling'
    )
  })
})
