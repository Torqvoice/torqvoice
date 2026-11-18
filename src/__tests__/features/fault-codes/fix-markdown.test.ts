import { describe, expect, it } from 'vitest'
import { htmlToFixMarkdown } from '@/features/fault-codes/Lib/fixMarkdown'

describe('a fix written in the editor', () => {
  it('keeps paragraphs, bold and italic', () => {
    expect(
      htmlToFixMarkdown(
        '<p>The <strong>rear O2 plug</strong> was <em>chafed</em>.</p><p>Repaired it.</p>'
      )
    ).toBe('The **rear O2 plug** was *chafed*.\n\nRepaired it.')
  })

  it('keeps bullet and numbered lists', () => {
    expect(
      htmlToFixMarkdown(
        '<ul><li><p>Checked fuses</p></li><li><p>Measured 0.2 V</p></li></ul><ol><li><p>Unplug</p></li><li><p>Clean pins</p></li></ol>'
      )
    ).toBe('- Checked fuses\n- Measured 0.2 V\n\n1. Unplug\n2. Clean pins')
  })

  it('keeps a quote and a line break', () => {
    expect(
      htmlToFixMarkdown(
        '<blockquote><p>Bulletin 18-2190</p></blockquote><p>Line one<br>line two</p>'
      )
    ).toBe('> Bulletin 18-2190\n\nLine one\\\nline two')
  })

  it('keeps only the text of what Markdown has no place for', () => {
    expect(
      htmlToFixMarkdown('<p><u>Underlined</u> and <a href="https://example.com">a link</a></p>')
    ).toBe('Underlined and a link')
  })

  it('escapes characters Markdown would read as formatting', () => {
    expect(htmlToFixMarkdown('<p>Pin 3_4 at 5*2 Nm</p>')).toBe('Pin 3\\_4 at 5\\*2 Nm')
  })

  it('is empty for an empty editor', () => {
    expect(htmlToFixMarkdown('<p></p>')).toBe('')
  })
})
