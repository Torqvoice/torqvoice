/**
 * The customer's sheet before anything on it has been measured.
 *
 * The shared invoice, quote and inspection pages and the portal's invoice
 * draw the document with SpecSheet, which places blocks by heights only a
 * browser can measure and fits the paper to a width only a browser knows. The
 * server's markup used to show every row at the top margin on a full-size
 * sheet until hydration. Now it shows paper of the right shape, and the sheet
 * takes its place in the pass that measures it.
 */
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import type { Block, DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

const block = (id: string, order: number): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order },
  content: { kind: 'text', id, text: `${id} text` },
})

const SPEC: DocumentSpec = {
  page: {
    width: 595,
    height: 842,
    margin: { top: 40, right: 40, bottom: 40, left: 40 },
    background: '#ffffff',
    text: '#111827',
    muted: '#6b7280',
    accent: '#d97706',
    fontFamily: 'Helvetica',
    fontSize: 9,
  },
  blocks: [block('a', 0), block('b', 1), block('c', 2)],
}

/** Whether an element can be seen: neither it nor anything around it is hidden. */
function shown(element: Element | null): boolean {
  for (let node = element; node; node = node.parentElement) {
    if ((node as HTMLElement).style?.visibility === 'hidden') return false
  }
  return element !== null
}

afterEach(cleanup)

describe('the sheet a customer opens', () => {
  it('is paper of the page shape, with no block to see, as the server sends it', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<SpecSheet spec={SPEC} />)

    const paper = host.querySelector<HTMLElement>('[data-sheet-loading]')
    expect(paper).not.toBeNull()
    // Sized by CSS alone, so it is right on a phone before any script runs.
    expect(paper?.style.width).toBe('100%')
    expect(paper?.style.aspectRatio).toBe('595 / 842')

    const busy = host.querySelector<HTMLElement>('[aria-busy="true"]')
    expect(busy?.style.visibility).toBe('hidden')
    // Out of the flow's way: the paper alone gives the page its height.
    expect(busy?.style.height).toBe('0px')
    const texts = [...host.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && /^[abc] text$/.test(el.textContent ?? '')
    )
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some(shown)).toBe(false)
  })

  it('shows the blocks and drops the paper once mounted', () => {
    const { container } = render(<SpecSheet spec={SPEC} />)
    expect(container.querySelector('[data-sheet-loading]')).toBeNull()
    expect(container.querySelector('[aria-busy]')).toBeNull()
    const texts = [...container.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && /^[abc] text$/.test(el.textContent ?? '')
    )
    // Each block is drawn twice: once to be measured, once on the sheet.
    expect(texts.filter(shown).map((el) => el.textContent)).toEqual(['a text', 'b text', 'c text'])
  })

  it('never brings the paper back when the document changes', () => {
    const { container, rerender } = render(<SpecSheet spec={SPEC} />)
    rerender(<SpecSheet spec={{ ...SPEC, blocks: [...SPEC.blocks, block('d', 3)] }} />)
    expect(container.querySelector('[data-sheet-loading]')).toBeNull()
  })
})
