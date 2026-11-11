import { describe, expect, it } from 'vitest'
import { richTextToPlain } from '@/lib/rich-text-plain'

/**
 * Notes are typed in a rich-text editor and stored as HTML. A ledger shows a
 * line of text exactly as it is handed over, so what goes there has to read
 * the way the note read in the editor.
 */
describe('richTextToPlain', () => {
  it('reads a paragraph as its text, with entities as the characters typed', () => {
    expect(richTextToPlain('<p>Clutch is worn &amp; the bearing is noisy.</p>')).toBe(
      'Clutch is worn & the bearing is noisy.'
    )
    expect(richTextToPlain('<p>Pads &lt; 3&nbsp;mm, &quot;urgent&quot; &#8211; &#x2713;</p>')).toBe(
      'Pads < 3 mm, "urgent" – ✓'
    )
  })

  it('puts each paragraph on a line and keeps the blank line the writer left', () => {
    expect(richTextToPlain('<p>Replaced rear pads.</p><p>Discs are fine.</p>')).toBe(
      'Replaced rear pads.\nDiscs are fine.'
    )
    expect(richTextToPlain('<p>Replaced rear pads.</p><p></p><p>Next service in May.</p>')).toBe(
      'Replaced rear pads.\n\nNext service in May.'
    )
    expect(richTextToPlain('<p>First line<br>second line</p>')).toBe('First line\nsecond line')
  })

  it('drops bold, italics and links but keeps their words', () => {
    expect(
      richTextToPlain(
        '<p><strong>Note:</strong> <em>front</em> tyres at <u>2 mm</u>, see <a href="https://example.com/t">the report</a>.</p>'
      )
    ).toBe('Note: front tyres at 2 mm, see the report.')
  })

  it('writes list items one per line, numbered when the list is', () => {
    expect(
      richTextToPlain('<p>Done:</p><ul><li><p>Oil change</p></li><li><p>New filter</p></li></ul>')
    ).toBe('Done:\n- Oil change\n- New filter')
    expect(
      richTextToPlain('<ol><li><p>Drain</p></li><li><p>Refill</p></li></ol><p>Checked level.</p>')
    ).toBe('1. Drain\n2. Refill\nChecked level.')
    expect(
      richTextToPlain('<ul><li><p>Brakes</p><ul><li><p>Front pads</p></li></ul></li></ul>')
    ).toBe('- Brakes\n  - Front pads')
  })

  it('carries a numbered list on from the number it starts at', () => {
    expect(
      richTextToPlain(
        '<ol start="4"><li><p>Bleed the brakes</p></li><li><p>Road test</p></li></ol>'
      )
    ).toBe('4. Bleed the brakes\n5. Road test')
  })

  it('keeps an address written in angle brackets', () => {
    expect(richTextToPlain('Send the receipt to <accounts@example.com> after payment.')).toBe(
      'Send the receipt to <accounts@example.com> after payment.'
    )
    // The editor stores the brackets as entities, so they come back as typed.
    expect(
      richTextToPlain('<p>Send the receipt to &lt;accounts@example.com&gt; after payment.</p>')
    ).toBe('Send the receipt to <accounts@example.com> after payment.')
    // An address is not markup, so the line breaks of a plain note stay.
    expect(richTextToPlain('Ask <p@example.com>\nabout the invoice.')).toBe(
      'Ask <p@example.com>\nabout the invoice.'
    )
  })

  it('ignores the spacing between tags in markup written by hand', () => {
    expect(richTextToPlain('<p>One</p>\n  <p>Two\n  words</p>\n')).toBe('One\nTwo words')
  })

  it('passes a note saved without markup through, line breaks included', () => {
    expect(richTextToPlain('Thank you.\nPads < 3 mm & worn.\r\n\r\nSee you in May.')).toBe(
      'Thank you.\nPads < 3 mm & worn.\n\nSee you in May.'
    )
  })

  it('is empty for a note with nothing in it', () => {
    expect(richTextToPlain(null)).toBe('')
    expect(richTextToPlain('')).toBe('')
    expect(richTextToPlain('<p></p>')).toBe('')
    expect(richTextToPlain('<p>   </p><p><br></p>')).toBe('')
  })
})
