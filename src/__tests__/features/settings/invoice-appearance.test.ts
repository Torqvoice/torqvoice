/**
 * The appearance a workshop chooses has to reach every line, not the few that
 * happen to inherit it. Text color once only moved the lines with no color of
 * their own; everything styled inline stayed gray.
 */
import { describe, it, expect } from 'vitest'
import {
  createStyles,
  inkColors,
  mixColor,
} from '@/features/vehicles/Components/invoice-pdf/styles'

const read = (styles: Record<string, unknown>, key: string) =>
  (styles[key] as { color?: string }).color

describe('invoice appearance', () => {
  it('leaves the default palette alone when nothing is chosen', () => {
    const styles = createStyles('#d97706', 'Helvetica')
    expect(read(styles, 'page')).toBe('#111827')
    expect(read(styles, 'infoTextSmall')).toBe('#6b7280')
    expect(read(styles, 'footer')).toBe('#6b7280')
  })

  it('measures every size from the body size', async () => {
    const { BASE_FONT_SIZE } = await import('@/features/vehicles/Components/invoice-pdf/styles')
    const styles = createStyles('#d97706', 'Helvetica') as unknown as Record<
      string,
      { fontSize?: number }
    >
    // Sizes used to be written out one by one, so raising the body size left a
    // table at one scale and a heading at another.
    expect(styles.page.fontSize).toBe(BASE_FONT_SIZE)
    expect(styles.infoText.fontSize).toBe(BASE_FONT_SIZE)
    expect(styles.infoTextSmall.fontSize).toBe(BASE_FONT_SIZE - 1)
    expect(styles.tableHeaderCell.fontSize).toBe(BASE_FONT_SIZE - 2)
    expect(styles.sectionTitle.fontSize).toBe(BASE_FONT_SIZE + 2)
    expect(styles.grandTotalValue.fontSize).toBe(BASE_FONT_SIZE + 4)
  })

  it('carries a chosen ink into every text style, primary and secondary', () => {
    const styles = createStyles('#d97706', 'Helvetica', 'standard', undefined, '#1e3a5f')
    const { ink, muted } = inkColors(styles)

    expect(ink).toBe('#1e3a5f')
    expect(read(styles, 'page')).toBe(ink)
    expect(read(styles, 'sectionTitle')).toBe(ink)

    // Secondary lines follow the ink rather than staying at one fixed gray, or
    // they would be unreadable on a dark sheet and mismatched on a tinted one.
    for (const key of ['infoTextSmall', 'totalLabel', 'notesText', 'footer', 'brandSub']) {
      expect(read(styles, key), key).toBe(muted)
    }
    expect(muted).not.toBe(ink)
    expect(muted).not.toBe('#6b7280')
  })

  it('mutes toward the sheet, so the tone suits the paper it prints on', () => {
    const onWhite = inkColors(
      createStyles('#d97706', 'Helvetica', 'standard', undefined, '#000000')
    )
    const onBlack = inkColors(
      createStyles('#d97706', 'Helvetica', 'standard', '#000000', '#ffffff')
    )
    expect(onWhite.muted).toBe(mixColor('#000000', '#ffffff', 0.42))
    expect(onBlack.muted).toBe(mixColor('#ffffff', '#000000', 0.42))
  })

  it('tints the sheet only when asked', () => {
    expect(read(createStyles('#d97706', 'Helvetica'), 'page')).toBeTruthy()
    const plain = createStyles('#d97706', 'Helvetica').page as { backgroundColor?: string }
    const tinted = createStyles('#d97706', 'Helvetica', 'standard', '#f4f4f2').page as {
      backgroundColor?: string
    }
    expect(plain.backgroundColor).toBeUndefined()
    expect(tinted.backgroundColor).toBe('#f4f4f2')
  })
})
