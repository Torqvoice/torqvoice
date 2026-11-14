/**
 * The body of a highlight is HTML written on torqvoice.com and set as HTML
 * inside a signed-in workshop. Only what the editor can produce survives.
 */

import { describe, expect, it } from 'vitest'
import { sanitizeBody } from '@/features/whats-new/Lib/sanitizeBody'

describe('highlight body', () => {
  it('keeps the formatting the editor produces', () => {
    const html =
      '<p>Put a <strong>call</strong> or a <em>delivery</em> on the calendar.</p><ul><li>One</li></ul>'
    expect(sanitizeBody(html)).toBe(html)
  })

  it('drops scripts with their content, and every attribute', () => {
    expect(
      sanitizeBody('<p onclick="x()" style="color:red">Hi</p><script>alert(1)</script><img src=x>')
    ).toBe('<p>Hi</p>')
  })

  it('keeps a web link, opened in a new tab', () => {
    expect(sanitizeBody('<a href="https://torqvoice.com/docs" class="x">Docs</a>')).toBe(
      '<a href="https://torqvoice.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>'
    )
  })

  it('keeps a link into the app as it is', () => {
    expect(sanitizeBody('<a href="/calendar">Calendar</a>')).toBe(
      '<a href="/calendar">Calendar</a>'
    )
  })

  it('removes the address from a link that is neither', () => {
    expect(sanitizeBody('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeBody('<a href="//evil.example">x</a>')).toBe('<a>x</a>')
  })
})
