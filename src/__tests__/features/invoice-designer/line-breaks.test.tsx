/**
 * The share view renders the same document spec the PDF prints, but in HTML,
 * where a newline folds into a space unless the CSS says otherwise. A part
 * description or a bank block typed on several lines came out as one run-on
 * line there while the PDF had it right.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { RenderNode } from '@/features/invoice-designer/Render/renderHtml'

describe('html sheet line breaks', () => {
  it('keeps the breaks in a text node', () => {
    const { container } = render(
      <RenderNode node={{ kind: 'text', text: 'Bank 1234 5678\nIBAN NO12 3456', style: {} }} />
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.textContent).toContain('\n')
    expect(el.style.whiteSpace).toBe('pre-line')
  })

  it('leaves rich text alone, where the newlines are markup rather than breaks', () => {
    // Sanitized notes arrive as <p>...</p>\n<p>...</p>. Honouring those
    // newlines would print a blank line between every paragraph.
    const { container } = render(
      <RenderNode node={{ kind: 'richtext', html: '<p>One</p>\n<p>Two</p>', style: {} }} />
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.whiteSpace).toBe('normal')
  })

  it('keeps the breaks in a table cell, which carries its own styles', () => {
    const { container } = render(
      <RenderNode
        node={{
          kind: 'table',
          columns: [
            { key: 'description', label: 'Description', width: 'flex' },
            { key: 'total', label: 'Total', width: 60, align: 'right' },
          ],
          rows: [{ description: 'Brake pads\nfront axle', total: '120,00' }],
        }}
      />
    )
    const cell = Array.from(container.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Brake pads')
    ) as HTMLElement
    expect(cell.style.whiteSpace).toBe('pre-line')
  })
})
