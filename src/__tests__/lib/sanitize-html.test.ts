/**
 * Notes, calendar descriptions and designer text are typed in the rich text
 * editor, stored as HTML and later set as HTML in front of other staff and
 * customers. What comes out of the sanitizer must only ever contain the
 * handful of tags the editor writes, whatever went in.
 */

import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitize-html'

/** Any `<` that is not one of the bare tags the sanitizer itself writes. */
const FOREIGN_TAG = /<(?!\/?(p|br|strong|b|em|i|u|h2|h3|ul|ol|li|blockquote)>)/

describe('sanitizeHtml', () => {
  it('leaves what the editor writes exactly as it was', () => {
    const html =
      '<h2>Brakes</h2><p>Front pads at <strong>3 mm</strong>, <em>replace</em> soon.</p><ul><li>Pads</li><li>Discs</li></ul><blockquote>Customer approved</blockquote><p>Wear &lt; 3 mm &amp; uneven</p>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('removes other tags and every attribute, keeping the words', () => {
    expect(
      sanitizeHtml(
        '<p class="x" onclick="steal()">Hi <span style="color:red">there</span></p><img src="x">'
      )
    ).toBe('<p>Hi there</p>')
  })

  it.each([
    '<<x>img src=x onerror=alert(1)>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<<p>script>alert(1)<</p>/script>',
    '<im<b>g src=x onerror=alert(1)>',
    '<<<x>>svg onload=alert(1)>',
    '<p>ok</p><',
    '< img src=x onerror=alert(1)>',
  ])('never lets the pieces of a removed tag form another: %s', (input) => {
    expect(sanitizeHtml(input)).not.toMatch(FOREIGN_TAG)
  })

  it('shows a stray angle bracket as text', () => {
    expect(sanitizeHtml('<p>a < b</p>')).toBe('<p>a &lt; b</p>')
  })
})
